import { getShellProfile, isArm, isDarwin } from '../platform.js'
import { ensureLine, sh, sudoSh } from './helpers.js'

/** Ensure Homebrew is installed on macOS; no-op on other platforms */
export async function ensureHomebrew(): Promise<void> {
  if (!isDarwin()) return
  const brewPrefix = isArm() ? '/opt/homebrew' : '/usr/local'
  const brewBin = `${brewPrefix}/bin/brew`

  // Already available in PATH or at the known location
  const brewCheck = await sh('command -v brew')
  if (brewCheck.code === 0) return
  const brewExists = await sh(`test -x ${brewBin}`)
  if (brewExists.code === 0) {
    // Binary exists but isn't in PATH yet — just configure the profile
    const profile = getShellProfile()
    await ensureLine(profile, `eval "$(${brewBin} shellenv)"`)
    return
  }

  // Ensure Xcode Command Line Tools are present (Homebrew prerequisite)
  const xcodeCheck = await sh('xcode-select -p 2>/dev/null')
  if (xcodeCheck.code !== 0) {
    const xcodeInstall = await sh(
      'xcode-select --install 2>&1 && until xcode-select -p &>/dev/null; do sleep 5; done',
      {
        interactive: true,
        timeout: 600000,
      }
    )
    if (xcodeInstall.code !== 0) {
      throw new Error(
        'Xcode Command Line Tools installation failed. Please run "xcode-select --install" manually and retry.'
      )
    }
  }

  const installResult = await sh(
    'NONINTERACTIVE=1 bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"',
    { interactive: true, timeout: 300000 }
  )
  if (installResult.code !== 0) {
    throw new Error(
      `Homebrew installation failed (exit code ${installResult.code}). Check /tmp/welcome.log for details.`
    )
  }

  // Verify the binary actually exists after install
  const verifyResult = await sh(`test -x ${brewBin}`)
  if (verifyResult.code !== 0) {
    throw new Error(
      `Homebrew installation succeeded but ${brewBin} was not found. Check /tmp/welcome.log for details.`
    )
  }

  const profile = getShellProfile()
  await ensureLine(profile, `eval "$(${brewBin} shellenv)"`)
}

/**
 * Prompt for administrator credentials before parallel tasks begin.
 *
 * - **macOS**: runs a no-op (`/usr/bin/true`) via `sudoSh()` which triggers
 *   the native macOS authentication dialog.  This validates that the user
 *   *can* authenticate (e.g. "Root permissions" is enabled in Self Service+)
 *   and may briefly cache the authorisation for subsequent `sudoSh()` calls.
 *
 * - **Linux**: uses `sudo -v` with inherited stdin so the user can type
 *   their password in the terminal.
 */
export async function warmupSudo(): Promise<boolean> {
  const result = isDarwin()
    ? await sudoSh('/usr/bin/true', { timeout: 120000 })
    : await sh('sudo -v', { interactive: true, timeout: 120000 })
  return result.code === 0
}
