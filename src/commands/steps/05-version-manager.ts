import { type SetupConfig } from '../../context/index.js'
import { getShellProfile, getShellRc, getUserShell } from '../../platform.js'
import { HOME, REPO_PATH } from '../constants.js'
import {
  dirExists,
  ensureLine,
  fileExists,
  getErrorMessage,
  makeShTool,
  sh,
  shellEscape,
  sudoSh,
  type ProgressCallback,
  type TaskResult,
} from '../helpers.js'
import { copyFile } from 'node:fs/promises'
import path from 'node:path'

/** Step 5: Setup version manager (asdf or mise) */
export async function runStep5(
  config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    const plugins = ['rust', 'ruby', 'nodejs', 'python']
    const toolPlugins = {
      bazelisk: 'https://github.com/josephtate/asdf-bazelisk.git',
      'adr-tools': 'https://gitlab.com/td7x/asdf/adr-tools.git',
      // Download the official Atlas binary instead of requiring Go to build it.
      atlas: 'https://github.com/lukeab/asdf-plugin-atlas.git',
    }
    const useMise = config.versionManager === 'mise'
    const shellRc = getShellRc()
    const shellProfile = getShellProfile()
    const shell = getUserShell()
    // The version manager's own binary and the tools it installs must resolve
    // without depending on how the login shell orders PATH.
    const shTool = makeShTool(config.versionManager)

    // 0. Copy .factorialrc
    onProgress(0, 'Copying .factorialrc...')
    const factorialrcSrc = path.join(REPO_PATH, '.local-dev', '.factorialrc')
    const factorialrcDst = path.join(HOME, '.factorialrc')
    if (await fileExists(factorialrcSrc)) {
      await copyFile(factorialrcSrc, factorialrcDst)
    }
    await ensureLine(shellRc, 'source "$HOME/.factorialrc"')

    if (useMise) {
      // 1. Add mise to PATH
      onProgress(1, 'Setting up mise version manager...')
      // Also write to the profile (not just shellRc): sh()/sudoSh() run via a
      // login shell, and on macOS that triggers path_helper, which pushes
      // mise's shims behind /usr/bin. shellRc only loads for interactive
      // shells, so it can't undo that; the profile loads for login shells
      // either way and runs after path_helper.
      await ensureLine(shellRc, `eval "$(mise activate ${shell})"`)
      await ensureLine(shellProfile, `eval "$(mise activate ${shell})"`)

      // 2-5. Install plugins
      for (let i = 0; i < plugins.length; i++) {
        onProgress(i + 2, `Installing plugin: ${plugins[i]}...`)
        await shTool(`mise use -g "${plugins[i]}@latest"`, {
          env: { RUBY_CONFIGURE_OPTS: '--enable-yjit' },
        })
      }

      // 6. Install rust specific version
      onProgress(6, 'Installing Rust 1.96.0...')
      await shTool('mise use -g rust@1.96.0')
    } else {
      // asdf
      onProgress(1, 'Setting up asdf version manager...')
      const asdfPath = 'export PATH="${ASDF_DATA_DIR:-$HOME/.asdf}/shims:$PATH"'
      await ensureLine(shellRc, asdfPath)
      // Same login-shell path_helper issue as the mise branch above: without
      // this, asdf's shims lose out to /usr/bin in the wizard's own `sh()` calls.
      await ensureLine(shellProfile, asdfPath)

      for (let i = 0; i < plugins.length; i++) {
        const plugin = plugins[i]!
        onProgress(i + 2, `Installing plugin: ${plugin}...`)
        const list = await shTool('asdf plugin list')
        if (list.stdout.includes(plugin)) {
          await shTool(`asdf plugin update ${plugin}`)
        } else {
          await shTool(`asdf plugin add ${plugin}`)
        }
      }

      onProgress(6, 'Installing Rust...')
      await shTool('asdf install rust', { env: { ASDF_RUST_VERSION: '1.96.0' } })
    }

    onProgress(7, 'Installing Bazelisk, adr-tools, and Atlas...')
    if (useMise) {
      const tools = Object.keys(toolPlugins).map((tool) => `${tool}@latest`)
      await shTool(`mise use -g ${tools.join(' ')}`, {
        cwd: HOME,
        interactive: true,
        check: true,
      })
    } else {
      const list = await shTool('asdf plugin list', { check: true })
      const installedPlugins = list.stdout.trim().split(/\s+/)
      for (const [tool, repository] of Object.entries(toolPlugins)) {
        if (installedPlugins.includes(tool)) {
          await shTool(`asdf plugin update ${tool}`, { check: true })
        } else {
          await shTool(`asdf plugin add ${tool} ${repository}`, { check: true })
        }
        await shTool(`asdf install ${tool} latest`, { interactive: true, check: true })
        await shTool(`asdf set --home ${tool} latest`, { check: true })
      }
    }

    // Install repository-pinned versions after registering all tools.
    onProgress(8, 'Installing all versions from .tool-versions...')
    await shTool(`${config.versionManager} install`, {
      cwd: REPO_PATH,
      interactive: true,
      check: true,
    })

    // Both managers expose bazelisk only; keep bazel available for global and repo versions.
    onProgress(9, 'Configuring Bazel launcher...')
    for (const cwd of [HOME, REPO_PATH]) {
      const result = await shTool(`${config.versionManager} which bazelisk`, { cwd, check: true })
      const binary = result.stdout.trim()
      const launcher = path.join(path.dirname(binary), 'bazel')
      await shTool(`ln -sf ${shellEscape(path.basename(binary))} ${shellEscape(launcher)}`, {
        check: true,
      })
    }
    await shTool(useMise ? 'mise reshim' : 'asdf reshim bazelisk', { check: true })

    if (!useMise) {
      // Fix permissions — resolve username now because sudoSh on macOS runs as
      // root (where $(whoami) would return "root").
      const asdfInstalls = path.join(HOME, '.asdf', 'installs')
      if (await dirExists(asdfInstalls)) {
        const username = process.env.USER || (await sh('whoami')).stdout.trim()
        await sudoSh(`chown -R ${username} "${asdfInstalls}"`)
      }
    }

    return { success: true, duration: Date.now() - start }
  } catch (e) {
    return {
      success: false,
      error: getErrorMessage(e),
      duration: Date.now() - start,
    }
  }
}
