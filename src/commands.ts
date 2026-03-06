import { spawn, type ChildProcess } from 'node:child_process'
import { readFile, writeFile, appendFile, mkdir, access, copyFile, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir, arch as osArch } from 'node:os'
import path from 'node:path'
import { createWriteStream } from 'node:fs'
import type { SetupConfig } from './context.js'
import {
  getPlatform,
  isDarwin,
  isLinux,
  getShellArgs,
  getShellProfile,
  getShellRc,
  getClipboardCommand,
  getOpenCommand,
  getSshAddCommand,
  getRamCommand,
  getOsVersionCommand,
  getMachineIdCommand,
  getDockerDesktopCheckPath,
  isArm,
  buildPackageInstallPlan,
  getNativeInstallCommand,
  getAurInstallCommand,
  buildGuiAppInstallPlan,
  getLibBuildFlags,
  getDockerInstallStrategy,
  getDockerNativeInstallCommands,
  getDockerServiceCommands,
  getUserShell,
} from './platform.js'

// ── Constants (matching welcome.sh) ─────────────────────
const HOME = homedir()
const ROOT_DIR = path.join(HOME, '.factorial')
const LOG_FILE = '/tmp/welcome.log'
const CODE_DIR = path.join(HOME, 'code')
const SSH_DIR = path.join(HOME, '.ssh')
const ORG_NAME = 'factorialco'
const REPO_NAME = 'factorial'
const REPO_PATH = path.join(CODE_DIR, REPO_NAME)
const LOCAL_DOMAIN = 'local.factorial.dev'
const LOCAL_AWS_PROFILE = 'development'
const LOCAL_AWS_DEFAULT_REGION = 'eu-central-1'
const BUNDLER_VERSION = '2.5.11'
const PERSONAL_ENV_RC_PATH = path.join(REPO_PATH, '.envrc.personal')

const STATIC_HOSTS = [
  'api',
  'app',
  'backstage',
  'careers',
  'mastra',
  'ws',
  'id',
  'idp',
  'chat2db',
  'minio',
  'minio-console',
  'it-management-common-service',
  'it-management-marketplace-service'
]
const WEBPAGE_COUNTRIES = [
  'es',
  'us',
  'mx',
  'br',
  'ar',
  'co',
  'fr',
  'de',
  'gb',
  'it',
  'pt',
  'cl',
  'pl',
  'ke',
  'za'
]

const EXTENSIONS = [
  'bradlc.vscode-tailwindcss',
  'christian-kohler.npm-intellisense',
  'cucumberopen.cucumber-official',
  'dbaeumer.vscode-eslint',
  'eamodio.gitlens',
  'editorconfig.editorconfig',
  'oxc.oxc-vscode',
  'firsttris.vscode-jest-runner',
  'graphql.vscode-graphql',
  'graphql.vscode-graphql-syntax',
  'karunamurti.haml',
  'lokalise.i18n-ally',
  'Malo.copy-json-path',
  'mateuszdrewniak.ruby-test-runner',
  'ms-azuretools.vscode-docker',
  'ms-vscode.test-adapter-converter',
  'rubocop.vscode-rubocop',
  'ruby-syntax-tree.vscode-syntax-tree',
  'sorbet.sorbet-vscode-extension',
  'tomi.xasnippets',
  'unifiedjs.vscode-mdx',
  'usernamehw.errorlens',
  'redhat.vscode-yaml'
]

const SKILL_REPOS = [
  'factorialco/factorial-skills',
]

// ── Types ───────────────────────────────────────────────
export type ProgressCallback = (subtaskIndex: number, detail: string) => void
export type TaskResult = { success: boolean; error?: string; duration: number }

// ── Helpers ─────────────────────────────────────────────

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function dirExists(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Run a shell command and return its output.
 * When `interactive` is true, stdin is inherited so the user can
 * respond to prompts (sudo, aws sso login, etc.), but stdout/stderr
 * are still piped and written to the log file to avoid corrupting
 * the Ink TUI layout.
 */
function runCommand(
  cmd: string,
  args: string[],
  options: {
    cwd?: string
    env?: Record<string, string>
    interactive?: boolean
    timeout?: number
  } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const stdio: ('inherit' | 'pipe')[] = options.interactive
      ? ['inherit', 'pipe', 'pipe']
      : ['pipe', 'pipe', 'pipe']

    const child: ChildProcess = spawn(cmd, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio,
      timeout: options.timeout
    })

    const logStream = createWriteStream(LOG_FILE, { flags: 'a' })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString()
      stdout += chunk
      logStream.write(chunk)
    })

    child.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString()
      stderr += chunk
      logStream.write(chunk)
    })

    child.on('error', (err) => {
      logStream.end()
      // If spawn itself failed (e.g. command not found), resolve with error code
      resolve({ code: 1, stdout: stdout.trim(), stderr: (stderr + '\n' + err.message).trim() })
    })
    child.on('close', (code) => {
      logStream.end()
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() })
    })
  })
}

/** Run a shell command string via the user's default shell */
async function sh(
  command: string,
  options: { cwd?: string; interactive?: boolean; env?: Record<string, string>; timeout?: number } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  const [shell, baseArgs] = getShellArgs()
  return runCommand(shell, [...baseArgs, command], options)
}

/**
 * Run a command with elevated (root) privileges.
 *
 * - **macOS**: uses `osascript` with `do shell script … with administrator
 *   privileges`, which shows the native macOS authentication dialog.
 *   Each invocation may prompt the user (macOS caches authorization briefly).
 *
 * - **Linux**: falls back to `sudo` with inherited stdin so the user can
 *   type their password in the terminal.
 */
async function sudoSh(
  command: string,
  options: { cwd?: string; timeout?: number } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  if (isDarwin()) {
    // Escape for AppleScript double-quoted string: backslashes then double quotes
    const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const script = `do shell script "${escaped}" with administrator privileges`
    return runCommand('/usr/bin/osascript', ['-e', script], options)
  }
  return sh(`sudo ${command}`, { ...options, interactive: true })
}

/** Ensure a line exists in a file (append if missing) */
async function ensureLine(filePath: string, line: string): Promise<void> {
  let content = ''
  if (await fileExists(filePath)) {
    content = await readFile(filePath, 'utf-8')
  }
  if (!content.includes(line)) {
    await appendFile(filePath, (content.endsWith('\n') || content === '' ? '' : '\n') + line + '\n')
  }
}

/** Add or update an env var in a file (matching welcome.sh's add_or_update_env_var) */
async function addOrUpdateEnvVar(
  varName: string,
  varValue: string,
  envFile: string
): Promise<void> {
  let content = ''
  if (await fileExists(envFile)) {
    content = await readFile(envFile, 'utf-8')
  }
  const exportLine = `export ${varName}=${varValue}`
  const regex = new RegExp(`^export ${varName}=.*$`, 'm')
  if (regex.test(content)) {
    content = content.replace(regex, exportLine)
    await writeFile(envFile, content)
  } else {
    await appendFile(
      envFile,
      (content.endsWith('\n') || content === '' ? '' : '\n') + exportLine + '\n'
    )
  }
}

// ── Brew formula names for all system packages ──────────
// Used by both the macOS Brewfile path and Linux package mapping
const BASE_BREW_FORMULAE = [
  'awscli',
  'bat',
  'direnv',
  'fzf',
  'gh',
  'git',
  'gitleaks',
  'htop',
  'imagemagick',
  'jq',
  'lazydocker',
  'libvips',
  'libyaml',
  'make',
  'mysql',
  'nss',
  'openssl',
  'pdftk-java',
  'ripgrep',
  'semgrep',
  'shared-mime-info',
  'watchman',
  'zstd',
  'gpg',
  'composer',
  'yq',
  'tmux',
]

const CLI_BREW_FORMULAE_MAP: Record<string, string> = {
  opencode: 'opencode',
  codex: 'codex'
}

const CLI_BREW_CASK_MAP: Record<string, string> = {
  claude: 'claude-code'
}

const EDITOR_CASK_MAP: Record<string, string> = {
  cursor: 'cursor',
  vscode: 'visual-studio-code'
}

// ── Task Runners ────────────────────────────────────────
// Each function corresponds to one of the 13 steps from welcome.sh.
// They report progress via the `onProgress` callback and return a TaskResult.

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
    const xcodeInstall = await sh('xcode-select --install 2>&1 && until xcode-select -p &>/dev/null; do sleep 5; done', {
      interactive: true,
      timeout: 600000
    })
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

/** Step 1: Install system packages */
export async function runStep1(
  config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    const platform = getPlatform()
    const versionManager = config.versionManager === 'mise' ? 'mise' : 'asdf'
    const cliFormulae = config.agenticClis.map((cli) => CLI_BREW_FORMULAE_MAP[cli]).filter(Boolean) as string[]
    const cliCasks = config.agenticClis.map((cli) => CLI_BREW_CASK_MAP[cli]).filter(Boolean) as string[]
    const allFormulae = [versionManager, ...BASE_BREW_FORMULAE, ...cliFormulae]

    if (platform === 'darwin') {
      // ── macOS: Homebrew path ──
      onProgress(0, 'Checking Homebrew installation...')
      await ensureHomebrew()

      // Generate Brewfile
      onProgress(1, 'Generating Brewfile...')
      await mkdir(ROOT_DIR, { recursive: true })
      const cliBrewLines = cliFormulae.map((f) => `brew "${f}"`)
      const cliCaskLines = cliCasks.map((f) => `cask "${f}"`)
      const editorCaskLines = config.editors.map((e) => `cask "${EDITOR_CASK_MAP[e]}"`)

      const brewfile =
        [
          `brew "${versionManager}"`,
          ...BASE_BREW_FORMULAE.map((f) => `brew "${f}"`),
          ...cliBrewLines,
          '',
          'cask_args appdir: "/Applications"',
          ...editorCaskLines,
          ...cliCaskLines,
          'cask "font-fira-code-nerd-font"',
          'cask "iterm2"',
          'cask "session-manager-plugin"',
          'cask "libreoffice"',
          'cask "ngrok"'
        ].join('\n') + '\n'

      await writeFile(path.join(ROOT_DIR, 'Brewfile'), brewfile)

      onProgress(2, 'Running brew bundle install (this may take a while)...')
      const brewResult = await sh(`brew bundle --file="${ROOT_DIR}/Brewfile" --force --no-upgrade`, {
        interactive: true
      })
      if (brewResult.code !== 0) {
        throw new Error('brew bundle install failed')
      }
    } else {
      // ── Linux: native package manager path ──
      // Add build prerequisites that macOS gets from Xcode Command Line Tools
      const linuxFormulae = [...allFormulae, 'pkg-config', 'build-essential']
      onProgress(0, 'Building package install plan...')
      const plan = await buildPackageInstallPlan(linuxFormulae)

      // Install native packages
      if (plan.nativePackages.length > 0) {
        onProgress(1, `Installing ${plan.nativePackages.length} system packages...`)
        // Ensure package index is up to date on apt-based systems
        await sh('sudo apt-get update 2>/dev/null || true', { interactive: true })
        const installCmd = await getNativeInstallCommand(plan.nativePackages)
        const result = await sh(installCmd, { interactive: true })
        if (result.code !== 0) {
          throw new Error('System package installation failed')
        }
      }

      // Install AUR packages (Arch only)
      if (plan.aurPackages.length > 0) {
        onProgress(2, `Installing ${plan.aurPackages.length} AUR packages...`)
        await sh(getAurInstallCommand(plan.aurPackages), { interactive: true })
      }

      // Run special install commands
      for (let i = 0; i < plan.specialInstalls.length; i++) {
        const { name, commands } = plan.specialInstalls[i]!
        onProgress(2, `Installing ${name}...`)
        for (const cmd of commands) {
          await sh(cmd, { interactive: true })
        }
      }

      // Install GUI apps
      onProgress(2, 'Installing GUI applications...')
      const guiApps = [
        ...config.editors.map((e) => ({ brewCask: EDITOR_CASK_MAP[e]!, name: e })),
        { brewCask: 'font-fira-code-nerd-font', name: 'Fira Code Nerd Font' },
        { brewCask: 'iterm2', name: 'iTerm2' },
        { brewCask: 'session-manager-plugin', name: 'AWS Session Manager' },
        { brewCask: 'libreoffice', name: 'LibreOffice' },
        { brewCask: 'ngrok', name: 'ngrok' },
      ]
      const guiPlan = await buildGuiAppInstallPlan(guiApps)
      for (const cmd of guiPlan.commands) {
        await sh(cmd, { interactive: true })
      }

      if (plan.skippedPackages.length > 0) {
        // Log skipped packages (non-fatal)
        onProgress(2, `Note: skipped packages not available on this platform: ${plan.skippedPackages.join(', ')}`)
      }
    }

    // Configure direnv (cross-platform)
    onProgress(3, 'Configuring direnv...')
    const direnvConfigDir = path.join(HOME, '.config', 'direnv')
    const direnvConfigFile = path.join(direnvConfigDir, 'direnv.toml')
    if (!(await fileExists(direnvConfigFile))) {
      await mkdir(direnvConfigDir, { recursive: true })
      await writeFile(direnvConfigFile, 'hide_env_diff = true\n')
    }

    return { success: true, duration: Date.now() - start }
  } catch (e: any) {
    return { success: false, error: e.message, duration: Date.now() - start }
  }
}

/** Step 2: Setup Docker */
export async function runStep2(
  _config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    const strategy = await getDockerInstallStrategy()

    if (strategy === 'colima') {
      // ── macOS: Colima path ──
      onProgress(0, 'Checking for Docker Desktop...')
      const dockerDesktopPath = getDockerDesktopCheckPath()
      if (dockerDesktopPath && await dirExists(dockerDesktopPath)) {
        throw new Error('Docker Desktop is installed. Please uninstall it before continuing.')
      }

      onProgress(1, 'Installing docker, colima, and plugins...')
      await sh(
        'brew install docker && brew link docker && brew install docker-compose docker-buildx docker-credential-helper-ecr colima',
        { interactive: true }
      )

      // Detect architecture and configure
      onProgress(2, 'Detecting architecture and configuring Colima...')
      const armArch = isArm()
      const macosVer = (await sh(getOsVersionCommand())).stdout
      const macosGe13 = parseInt(macosVer) >= 13
      const vmType = armArch && macosGe13 ? 'vz' : 'qemu'
      const mountType = armArch && macosGe13 ? 'virtiofs' : 'sshfs'
      const colimaArch = armArch ? 'aarch64' : 'x86_64'

      // Determine CPU/memory
      const totalRamGb = parseInt((await sh(getRamCommand())).stdout) / 1024 / 1024 / 1024
      const colimaCpu = totalRamGb > 40 ? 4 : 2
      const colimaMemory = totalRamGb > 40 ? 8 : 2

      // Write colima.yaml
      onProgress(3, 'Writing Colima configuration...')
      const colimaConfigDir = path.join(HOME, '.colima', 'default')
      await mkdir(colimaConfigDir, { recursive: true })
      const colimaConfig = `cpu: ${colimaCpu}\nmemory: ${colimaMemory}\ndisk: 100\narch: ${colimaArch}\nruntime: docker\nvmType: ${vmType}\nmountType: ${mountType}\nmounts: []\nkubernetes:\n  enabled: false\n`
      await writeFile(path.join(colimaConfigDir, 'colima.yaml'), colimaConfig)

      // Start Colima
      onProgress(4, 'Starting Colima...')
      await sh('colima status 2>&1 | grep -q "colima is running" && colima stop || true')
      await sh('colima start', { interactive: true })
      const serviceCommands = await getDockerServiceCommands()
      for (const cmd of serviceCommands) {
        await sh(cmd)
      }
      await sh('docker context use colima')
    } else {
      // ── Linux: native Docker Engine ──
      onProgress(0, 'Checking for existing Docker installation...')
      const dockerCheck = await sh('command -v docker')
      if (dockerCheck.code !== 0) {
        onProgress(1, 'Installing Docker Engine...')
        const installCommands = await getDockerNativeInstallCommands()
        for (const cmd of installCommands) {
          await sh(cmd, { interactive: true })
        }
      } else {
        onProgress(1, 'Docker already installed.')
      }

      // Ensure Docker service is running
      onProgress(2, 'Enabling Docker service...')
      const serviceCommands = await getDockerServiceCommands()
      for (const cmd of serviceCommands) {
        await sh(cmd, { interactive: true })
      }

      // Ensure current user can run docker without sudo
      onProgress(3, 'Configuring Docker group membership...')
      await sh(`sudo usermod -aG docker $USER 2>/dev/null || true`, { interactive: true })

      // Note: group change may require new login session
      // Try running docker with newgrp or sg
      onProgress(4, 'Verifying Docker access...')
      const canDocker = await sh('docker info >/dev/null 2>&1')
      if (canDocker.code !== 0) {
        // Try with sg (new group session) for immediate access
        await sh('sg docker -c "docker info" >/dev/null 2>&1 || true')
      }
    }

    // Test (cross-platform)
    onProgress(5, 'Testing docker with hello-world...')
    const dockerTest = await sh('docker run --rm hello-world')
    if (dockerTest.code !== 0) {
      // On Linux, the user may need to re-login for group changes
      if (isLinux()) {
        throw new Error(
          'Docker is installed but could not run containers. You may need to log out and back in for docker group membership to take effect, then re-run this step.'
        )
      }
      throw new Error('Docker is installed but could not run containers.')
    }

    return { success: true, duration: Date.now() - start }
  } catch (e: any) {
    return { success: false, error: e.message, duration: Date.now() - start }
  }
}

/** Step 3: Configure git identity (SSH is handled by the SSHSetup wizard step) */
export async function runStep3(
  config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    // Set git identity
    onProgress(0, 'Configuring git identity...')
    if (config.fullName) {
      await sh(`git config --global user.name "${config.fullName}"`)
    }
    if (config.email) {
      await sh(`git config --global user.email "${config.email}"`)
    }

    // SSH was already set up in the SSHSetup wizard step.
    // Just verify it's still working.
    if (config.sshKeyPath) {
      onProgress(1, 'Verifying SSH access...')
      const ok = config.sshKeyPath === '__default__'
        ? await checkGitHubConnectivity()
        : await verifySSHAccess(config.sshKeyPath)
      if (!ok) {
        throw new Error('SSH key no longer has access. Please re-run the wizard.')
      }
    }

    return { success: true, duration: Date.now() - start }
  } catch (e: any) {
    return { success: false, error: e.message, duration: Date.now() - start }
  }
}

/** Step 4: Clone Factorial repository */
export async function runStep4(
  config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    await mkdir(CODE_DIR, { recursive: true })

    // 1. Clone or pull
    onProgress(0, 'Cloning factorialco/factorial... (this may take a while, patience!)')
    if (!(await dirExists(REPO_PATH))) {
      const result = await sh(
        `git clone git@github.com:${ORG_NAME}/${REPO_NAME}.git "${REPO_PATH}"`,
        { interactive: true }
      )
      if (result.code !== 0) {
        throw new Error('Failed to clone Factorial repository')
      }
    } else if (await dirExists(path.join(REPO_PATH, '.git'))) {
      onProgress(0, 'Repository exists, pulling latest...')
      await sh('git pull', { cwd: REPO_PATH })
    }

    // 2. Git perf settings
    onProgress(1, 'Configuring git fsmonitor...')
    await sh(`git -C "${REPO_PATH}" config core.filemode false`)
    await sh(`git -C "${REPO_PATH}" config core.untrackedCache true`)

    onProgress(2, 'Configuring git untrackedCache...')
    await sh(`git -C "${REPO_PATH}" config core.fsmonitor true`)

    // 3. direnv allow
    onProgress(3, 'Running direnv allow...')
    await sh('find . -maxdepth 2 -name .envrc -execdir direnv allow \\;', { cwd: REPO_PATH })

    // 4. Branch-specific DB hook (optional)
    if (config.branchSpecificDb) {
      const hookPath = path.join(REPO_PATH, '.git', 'hooks', 'post-checkout')
      if (!(await fileExists(hookPath))) {
        const hookContent =
          '#!/bin/bash\n[ -x "backend/bin/post-checkout-hook" ] && backend/bin/post-checkout-hook "$@"\nexit 0\n'
        await writeFile(hookPath, hookContent, { mode: 0o755 })
      }
    }

    return { success: true, duration: Date.now() - start }
  } catch (e: any) {
    return { success: false, error: e.message, duration: Date.now() - start }
  }
}

/** Step 5: Setup version manager (asdf or mise) */
export async function runStep5(
  config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    const plugins = ['rust', 'ruby', 'nodejs', 'python']
    const useMise = config.versionManager === 'mise'
    const shellRc = getShellRc()
    const shell = getUserShell()

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
      await ensureLine(shellRc, `eval "$(mise activate ${shell})"`)

      // 2-5. Install plugins
      for (let i = 0; i < plugins.length; i++) {
        onProgress(i + 1, `Installing plugin: ${plugins[i]}...`)
        await sh(`mise use -g "${plugins[i]}@latest"`, {
          env: { RUBY_CONFIGURE_OPTS: '--enable-yjit' }
        })
      }

      // 6. Install rust specific version
      onProgress(5, 'Installing Rust 1.88.0...')
      await sh('mise use -g rust@1.88.0')

      // 7. Install all versions from repo
      onProgress(6, 'Installing all versions from .tool-versions...')
      await sh('mise install', { cwd: REPO_PATH, interactive: true })
    } else {
      // asdf
      onProgress(1, 'Setting up asdf version manager...')
      const asdfPath = 'export PATH="${ASDF_DATA_DIR:-$HOME/.asdf}/shims:$PATH"'
      await ensureLine(shellRc, asdfPath)

      for (let i = 0; i < plugins.length; i++) {
        const plugin = plugins[i]!
        onProgress(i + 1, `Installing plugin: ${plugin}...`)
        const list = await sh('asdf plugin list')
        if (list.stdout.includes(plugin)) {
          await sh(`asdf plugin update ${plugin}`)
        } else {
          await sh(`asdf plugin add ${plugin}`)
        }
      }

      onProgress(5, 'Installing Rust...')
      await sh('asdf install rust', { env: { ASDF_RUST_VERSION: '1.88.0' } })

      onProgress(6, 'Installing all versions from .tool-versions...')
      await sh('asdf install', { cwd: REPO_PATH, interactive: true })

      // Fix permissions — resolve username now because sudoSh on macOS runs as
      // root (where $(whoami) would return "root").
      const asdfInstalls = path.join(HOME, '.asdf', 'installs')
      if (await dirExists(asdfInstalls)) {
        const username = process.env.USER || (await sh('whoami')).stdout.trim()
        await sudoSh(`chown -R ${username} "${asdfInstalls}"`)
      }
    }

    return { success: true, duration: Date.now() - start }
  } catch (e: any) {
    return { success: false, error: e.message, duration: Date.now() - start }
  }
}

/** Step 6: Configure AWS credentials (SSO login is handled by the AWSSetup wizard step) */
export async function runStep6(
  _config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    // 1. Copy AWS config from repo (now that it's cloned)
    onProgress(0, 'Copying AWS config...')
    const awsDir = path.join(HOME, '.aws')
    await mkdir(awsDir, { recursive: true })
    const awsConfigSrc = path.join(REPO_PATH, '.local-dev', 'aws.config')
    const awsConfigDst = path.join(awsDir, 'config')

    if (!(await fileExists(awsConfigDst))) {
      if (await fileExists(awsConfigSrc)) {
        await copyFile(awsConfigSrc, awsConfigDst)
      }
    }

    // 2. Verify session is still active (login was done in AWSSetup wizard step)
    onProgress(1, 'Verifying AWS session...')
    const verify = await sh(
      `aws sts --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" get-caller-identity`
    )
    if (verify.code !== 0) {
      // Session may have expired — try re-login
      onProgress(1, 'Session expired, re-authenticating...')
      await sh(
        `aws sso --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" login`,
        { interactive: true }
      )
      const recheck = await sh(
        `aws sts --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" get-caller-identity`
      )
      if (recheck.code !== 0) {
        throw new Error('AWS SSO login failed. Please try again.')
      }
    }

    return { success: true, duration: Date.now() - start }
  } catch (e: any) {
    return { success: false, error: e.message, duration: Date.now() - start }
  }
}

/** Step 7: Update secrets from AWS Secrets Manager */
export async function runStep7(
  _config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    const secretName = `${LOCAL_AWS_PROFILE}/factorial/env`
    const secretsFile = path.join(REPO_PATH, '.envrc.localdev_secrets')

    // 1. Retrieve secret
    onProgress(0, 'Retrieving development/factorial/env...')
    const secretCmd = `aws secretsmanager get-secret-value --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" --secret-id "${secretName}" --output json 2>/dev/null`
    const result = await sh(secretCmd)
    if (result.code !== 0 || !result.stdout) {
      throw new Error('Failed to retrieve secret from AWS Secrets Manager.')
    }

    // 2. Parse and write secrets
    onProgress(1, 'Writing .envrc.localdev_secrets...')
    const parseCmd = `echo '${result.stdout.replace(
      /'/g,
      "'\\''"
    )}' | jq -r '.SecretString' | perl -pe 's/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]/\\n/g; s/\\r//g' | awk '{printf "%s\\\\n", $0}' | sed 's/\\\\n$//' | jq -R 'fromjson' | jq -r 'to_entries[]' | jq -r 'if .value | length > 0 then "export " + .key + "=" + (.value | @json) else empty end'`
    const parsed = await sh(parseCmd)
    if (parsed.code === 0) {
      await writeFile(secretsFile, parsed.stdout + '\n')
    }

    // Touch personal env file
    if (!(await fileExists(PERSONAL_ENV_RC_PATH))) {
      await writeFile(PERSONAL_ENV_RC_PATH, '')
    }

    return { success: true, duration: Date.now() - start }
  } catch (e: any) {
    return { success: false, error: e.message, duration: Date.now() - start }
  }
}

/** Step 8: Setup local hosts file */
export async function runStep8(
  _config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    // 1. Read current /etc/hosts
    onProgress(0, 'Reading current /etc/hosts...')
    const hostsContent = await readFile('/etc/hosts', 'utf-8')

    // 2. Build host entries
    onProgress(1, 'Checking for missing host entries...')
    const allHosts: string[] = [
      ...STATIC_HOSTS.map((h) => `${h}.${LOCAL_DOMAIN}`),
      ...WEBPAGE_COUNTRIES.map((c) => `webpage-${c}.${LOCAL_DOMAIN}`)
    ]

    const missingHosts = allHosts.filter((host) => {
      const regex = new RegExp(`^[^#]*\\s${host.replace(/\./g, '\\.')}(\\s|$)`, 'm')
      return !regex.test(hostsContent)
    })

    if (missingHosts.length === 0) {
      onProgress(2, 'All host entries already present.')
    } else {
      // 3. Write to /etc/hosts (requires elevated privileges)
      onProgress(2, `Adding ${missingHosts.length} entries to /etc/hosts...`)
      const hostsEntry = `127.0.0.1 ${allHosts.join(' ')}`
      // On macOS sudoSh uses osascript (native dialog); on Linux it uses sudo.
      // osascript's `do shell script` runs via /bin/sh -c, so >> redirection works.
      // On Linux, sudo needs `tee -a` because >> is evaluated by the calling shell.
      if (isDarwin()) {
        const result = await sudoSh(`echo '${hostsEntry}' >> /etc/hosts`)
        if (result.code !== 0) throw new Error('Failed to update /etc/hosts')
      } else {
        const result = await sh(`echo '${hostsEntry}' | sudo tee -a /etc/hosts >/dev/null`, {
          interactive: true
        })
        if (result.code !== 0) throw new Error('Failed to update /etc/hosts')
      }
    }

    return { success: true, duration: Date.now() - start }
  } catch (e: any) {
    return { success: false, error: e.message, duration: Date.now() - start }
  }
}

/** Step 9: Install editor extensions */
export async function runStep9(
  config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    if (config.editors.length === 0) {
      onProgress(0, 'Skipping editor extensions (no editors selected)...')
      return { success: true, duration: Date.now() - start }
    }

    for (const editor of config.editors) {
      const editorCmd = editor === 'cursor' ? 'cursor' : 'code'
      const editorName = editor === 'cursor' ? 'Cursor' : 'VS Code'
      const extensions = [...EXTENSIONS]

      // Add Copilot for VS Code users
      if (editor === 'vscode') {
        extensions.push('github.copilot', 'github.copilot-chat')
      }

      // 1. Install extensions
      onProgress(0, `Installing ${editorName} extensions...`)
      for (let i = 0; i < extensions.length; i++) {
        const ext = extensions[i]!
        onProgress(1, `[${editorName}] Installing ${ext} (${i + 1}/${extensions.length})...`)
        await sh(`${editorCmd} --install-extension "${ext}" --force 2>/dev/null || true`)
      }

      // 2. Custom .vsix extensions
      onProgress(2, `[${editorName}] Installing custom .vsix extensions...`)
      const extRepoPath = path.join(CODE_DIR, 'devenv-vscode-extensions')
      if (!(await dirExists(extRepoPath))) {
        await sh(
          `git clone git@github.com:factorialco/devenv-vscode-extensions.git "${extRepoPath}"`,
          { interactive: true }
        )
      } else {
        await sh('git pull', { cwd: extRepoPath })
      }

      const distDir = path.join(extRepoPath, 'dist')
      if (await dirExists(distDir)) {
        const files = await readdir(distDir)
        for (const file of files) {
          if (file.endsWith('.vsix')) {
            const vsixPath = path.join(distDir, file)
            await sh(`${editorCmd} --install-extension "${vsixPath}" --force 2>/dev/null || true`)
          }
        }
      }
    }

    return { success: true, duration: Date.now() - start }
  } catch (e: any) {
    return { success: false, error: e.message, duration: Date.now() - start }
  }
}

/** Step 10: Configure Ngrok tunnel */
export async function runStep10(
  config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    if (!config.setupNgrok) {
      return { success: true, duration: Date.now() - start }
    }

    // 1. Configure domain
    onProgress(0, `Configuring Ngrok domain: ${config.ngrokDomain || 'default'}...`)
    if (config.ngrokDomain) {
      await addOrUpdateEnvVar('TUNNEL_DOMAIN', config.ngrokDomain, PERSONAL_ENV_RC_PATH)
    }

    // 2. Set authtoken
    onProgress(1, 'Setting authtoken...')
    if (config.ngrokAuthtoken) {
      await sh(`ngrok config add-authtoken "${config.ngrokAuthtoken}"`)
      await addOrUpdateEnvVar('TUNNEL_AUTH_TOKEN', config.ngrokAuthtoken, PERSONAL_ENV_RC_PATH)
    }

    // 3. Test tunnel
    onProgress(2, 'Testing tunnel...')
    if (config.ngrokDomain && config.ngrokAuthtoken) {
      const configCheck = await sh('ngrok config check 2>/dev/null')
      if (configCheck.code !== 0) {
        throw new Error('Ngrok configuration check failed.')
      }

      // Quick tunnel test
      const testResult = await sh(
        `ngrok http --url=${config.ngrokDomain} 9999 --log=stdout --log-format=logfmt --authtoken=${config.ngrokAuthtoken} &
        NGROK_PID=$!
        sleep 3
        kill $NGROK_PID 2>/dev/null
        wait $NGROK_PID 2>/dev/null || true`
      )
      // If we got here without "authentication failed", we're good
      if (
        testResult.stdout.includes('authentication failed') ||
        testResult.stderr.includes('authentication failed')
      ) {
        throw new Error('Ngrok authentication failed.')
      }
    }

    // 4. Save to .envrc.personal
    onProgress(3, 'Saving to .envrc.personal...')

    return { success: true, duration: Date.now() - start }
  } catch (e: any) {
    return { success: false, error: e.message, duration: Date.now() - start }
  }
}

/** Step 11: Setup Cognito authentication */
export async function runStep11(
  config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    if (!config.setupCognito) {
      return { success: true, duration: Date.now() - start }
    }

    // Get workspace ID (platform-specific)
    const wsResult = await sh(getMachineIdCommand())
    const workspaceId = wsResult.stdout.trim()
    const cognitoConfigPath = path.join(
      REPO_PATH,
      '.local-dev',
      'scripts',
      'aws',
      'cognito',
      'config'
    )

    // 1. KMS
    onProgress(0, 'Provisioning KMS key...')
    const kmsCheck = await sh(
      `aws resourcegroupstaggingapi get-resources --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" --resource-type-filters kms --tag-filters Key=WorkspaceId,Values="${workspaceId}" --query 'ResourceTagMappingList[0].ResourceARN' --output text`
    )
    let kmsKeyArn: string
    if (kmsCheck.stdout && kmsCheck.stdout !== 'None') {
      const kmsDescribe = await sh(
        `aws kms describe-key --key-id "${kmsCheck.stdout}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`
      )
      kmsKeyArn = JSON.parse(kmsDescribe.stdout).KeyMetadata.Arn
    } else {
      const kmsCreate = await sh(
        `aws kms create-key --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" --description "KMS key for Cognito Lambda trigger" --tags TagKey=Environment,TagValue=development TagKey=WorkspaceId,TagValue="${workspaceId}" TagKey=Owner,TagValue="core identity"`
      )
      kmsKeyArn = JSON.parse(kmsCreate.stdout).KeyMetadata.Arn
    }

    // 2. IAM Role
    onProgress(1, 'Creating IAM Role...')
    const roleName = `${workspaceId}-role-lambda-trigger`
    const assumeRoleDoc = await readFile(
      path.join(cognitoConfigPath, 'lambda', 'assume-role-policy-document.json'),
      'utf-8'
    )
    let roleArn: string

    const roleCheck = await sh(
      `aws iam get-role --role-name "${roleName}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" 2>/dev/null`
    )
    if (roleCheck.code === 0) {
      await sh(
        `aws iam update-assume-role-policy --role-name "${roleName}" --policy-document '${assumeRoleDoc}' --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`
      )
      roleArn = JSON.parse(roleCheck.stdout).Role.Arn
    } else {
      const roleCreate = await sh(
        `aws iam create-role --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" --role-name "${roleName}" --assume-role-policy-document '${assumeRoleDoc}' --tags Key=Environment,Value=development Key=WorkspaceId,Value="${workspaceId}" Key=Owner,Value="core identity"`
      )
      roleArn = JSON.parse(roleCreate.stdout).Role.Arn
    }

    await sh(
      `aws iam attach-role-policy --role-name "${roleName}" --policy-arn "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`
    )

    // Update policy document with KMS ARN
    const policyDocPath = path.join(cognitoConfigPath, 'lambda', 'policy-document.json')
    await sh(
      `jq '.Statement[].Resource = $newVal' --arg newVal "${kmsKeyArn}" "${policyDocPath}" > /tmp/policy-tmp-$$.json && mv /tmp/policy-tmp-$$.json "${policyDocPath}"`
    )
    await sh(
      `aws iam put-role-policy --role-name "${roleName}" --policy-name "${workspaceId}-iam-role-policy-lambda-kms" --policy-document "file://${policyDocPath}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`
    )
    await sh(
      `cd "$(dirname "${policyDocPath}")" && git checkout -- "$(basename "${policyDocPath}")"`
    )

    // 3. Lambda
    onProgress(2, 'Deploying Lambda function...')
    const lambdaName = `development-${workspaceId}-cognito-lambda`

    // Download lambda zip
    const lambdaZipPath = path.join(cognitoConfigPath, 'lambda', 'lambda.zip')
    await sh(
      `aws s3 cp "s3://workspaces.factorial.co/backend/cognito/lambda.zip" "${lambdaZipPath}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`
    )

    // Delete existing lambda if present
    await sh(
      `aws lambda delete-function --function-name "${lambdaName}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" 2>/dev/null || true`
    )
    await sh('sleep 5') // Wait for deletion

    // Read tunnel domain
    let tunnelDomain = config.ngrokDomain
    if (!tunnelDomain) {
      const envContent = (await fileExists(PERSONAL_ENV_RC_PATH))
        ? await readFile(PERSONAL_ENV_RC_PATH, 'utf-8')
        : ''
      const match = envContent.match(/TUNNEL_DOMAIN=(.+)/)
      tunnelDomain = match?.[1] ?? ''
    }

    const lambdaConfig = await readFile(
      path.join(cognitoConfigPath, 'lambda', 'lambda-config.json'),
      'utf-8'
    )
    await sh(
      `aws lambda create-function --function-name "${lambdaName}" --environment 'Variables={KEY_ID=${kmsKeyArn},RAILS_SERVER_URL=${tunnelDomain},RAILS_SERVER_ACCESS_TOKEN=test}' --role "${roleArn}" --tags Environment=development,WorkspaceId="${workspaceId}",Owner='core identity' --zip-file "fileb://${lambdaZipPath}" --cli-input-json '${lambdaConfig}' --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`
    )
    const lambdaInfo = await sh(
      `aws lambda get-function --function-name "${lambdaName}" --query 'Configuration.FunctionArn' --output text --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`
    )
    const lambdaArn = lambdaInfo.stdout.trim()

    // Clean up zip
    await sh(`rm -f "${lambdaZipPath}"`)

    // 4. User Pool
    onProgress(3, 'Creating Cognito User Pool...')
    const userPoolName = workspaceId
    // Delete existing pool if needed
    const existingPool = await sh(
      `aws cognito-idp list-user-pools --max-results 60 --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" | jq -r --arg name "${userPoolName}" '.UserPools[] | select(.Name == $name) | .Id' | head -n 1`
    )
    if (existingPool.stdout) {
      // Delete domain first
      const domainCheck = await sh(
        `aws cognito-idp describe-user-pool --user-pool-id "${existingPool.stdout}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" | jq -r '.UserPool.Domain' 2>/dev/null`
      )
      if (domainCheck.stdout && domainCheck.stdout !== 'null') {
        await sh(
          `aws cognito-idp delete-user-pool-domain --user-pool-id "${existingPool.stdout}" --domain "${domainCheck.stdout}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`
        )
      }
      await sh(
        `aws cognito-idp delete-user-pool --user-pool-id "${existingPool.stdout}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`
      )
      await sh('sleep 5')
    }

    const userPoolConfig = await readFile(
      path.join(cognitoConfigPath, 'user-pool-config.json'),
      'utf-8'
    )
    const poolCreate = await sh(
      `aws cognito-idp create-user-pool --pool-name "${userPoolName}" --lambda-config='UserMigration="${lambdaArn}",CustomEmailSender={LambdaVersion=V1_0,LambdaArn="${lambdaArn}"},KMSKeyID="${kmsKeyArn}"' --user-pool-tags Environment=development,WorkspaceId="${workspaceId}",Owner='core identity' --cli-input-json '${userPoolConfig}' --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`
    )
    const poolData = JSON.parse(poolCreate.stdout)
    const userPoolId = poolData.UserPool.Id
    const userPoolArn = poolData.UserPool.Arn

    await sh(
      `aws cognito-idp set-user-pool-mfa-config --user-pool-id "${userPoolId}" --mfa-configuration "OPTIONAL" --software-token-mfa-configuration=Enabled=true --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`
    )

    // 5. User Pool Client
    onProgress(4, 'Creating User Pool Client...')
    const clientName = `${userPoolName}-client`
    const userPoolClientConfig = await readFile(
      path.join(cognitoConfigPath, 'user-pool-client-config.json'),
      'utf-8'
    )
    const clientCreate = await sh(
      `aws cognito-idp create-user-pool-client --user-pool-id "${userPoolId}" --client-name "${clientName}" --callback-urls "factorial://" "exp://localhost:19000" "https://api.${LOCAL_DOMAIN}/cognito/oauth" --logout-urls "https://app.${LOCAL_DOMAIN}" --default-redirect-uri "https://api.${LOCAL_DOMAIN}/cognito/oauth" --supported-identity-providers "COGNITO" --cli-input-json '${userPoolClientConfig}' --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`
    )
    const clientData = JSON.parse(clientCreate.stdout)
    const userPoolClientId = clientData.UserPoolClient.ClientId

    // 6. Domain
    onProgress(5, 'Configuring domain...')
    await sh(
      `aws cognito-idp create-user-pool-domain --user-pool-id "${userPoolId}" --domain "${workspaceId}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" 2>/dev/null || aws cognito-idp update-user-pool-domain --user-pool-id "${userPoolId}" --domain "${workspaceId}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`
    )

    // Add Lambda permission
    const dateToday = Math.floor(Date.now() / 1000)
    await sh(
      `aws lambda add-permission --action lambda:InvokeFunction --function-name "${lambdaName}" --principal cognito-idp.amazonaws.com --source-arn "${userPoolArn}" --statement-id "development-${dateToday}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`
    )

    // 7. Secrets Manager
    onProgress(6, 'Storing secrets in Secrets Manager...')
    const cognitoSecretsNs = `${LOCAL_AWS_PROFILE}/${workspaceId}/cognito_credentials`
    const metadataSecretsNs = `${LOCAL_AWS_PROFILE}/${workspaceId}/metadata`
    const cognitoHost = `${workspaceId}.auth.${LOCAL_AWS_DEFAULT_REGION}.amazoncognito.com`

    const cognitoSecretJson = JSON.stringify({
      pool_id: userPoolId,
      app_client_id: userPoolClientId,
      cognito_host: cognitoHost
    })
    const cognitoSecretCheck = await sh(
      `aws secretsmanager describe-secret --secret-id "${cognitoSecretsNs}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" 2>/dev/null`
    )
    if (cognitoSecretCheck.code === 0) {
      await sh(
        `aws secretsmanager put-secret-value --secret-id "${cognitoSecretsNs}" --secret-string '${cognitoSecretJson}' --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`
      )
    } else {
      await sh(
        `aws secretsmanager create-secret --name "${cognitoSecretsNs}" --description "Cognito credentials" --tags Key=Environment,Value=development Key=WorkspaceId,Value="${workspaceId}" Key=Owner,Value="core identity" --secret-string '${cognitoSecretJson}' --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`
      )
    }

    const metadataJson = JSON.stringify({ kms_key_arn: kmsKeyArn })
    const metadataCheck = await sh(
      `aws secretsmanager describe-secret --secret-id "${metadataSecretsNs}" --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" 2>/dev/null`
    )
    if (metadataCheck.code === 0) {
      await sh(
        `aws secretsmanager put-secret-value --secret-id "${metadataSecretsNs}" --secret-string '${metadataJson}' --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`
      )
    } else {
      await sh(
        `aws secretsmanager create-secret --name "${metadataSecretsNs}" --description "AWS metadata" --tags Key=Environment,Value=development Key=WorkspaceId,Value="${workspaceId}" Key=Owner,Value="core identity" --secret-string '${metadataJson}' --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}"`
      )
    }

    await addOrUpdateEnvVar('COGNITO_SECRETS_NAMESPACE', cognitoSecretsNs, PERSONAL_ENV_RC_PATH)
    await addOrUpdateEnvVar('METADATA_SECRETS_NAMESPACE', metadataSecretsNs, PERSONAL_ENV_RC_PATH)

    return { success: true, duration: Date.now() - start }
  } catch (e: any) {
    return { success: false, error: e.message, duration: Date.now() - start }
  }
}

/** Step 12: Setup development environment */
export async function runStep12(
  config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    // 0. Install yarn/pnpm and run pnpm i
    onProgress(0, 'Installing yarn and pnpm globally...')
    await sh('npm install --global yarn pnpm', { interactive: true })

    onProgress(1, 'Running pnpm install...')
    await sh('pnpm i', { cwd: REPO_PATH, interactive: true })

    // 1. Install bundler + bundle install
    onProgress(2, 'Installing bundler and running bundle install...')
    const gemPath = (await sh('command -v gem')).stdout
    const isUserGem = gemPath.includes(process.env.USER || '')
    if (isUserGem) {
      await sh(`gem install bundler -v "${BUNDLER_VERSION}"`, {
        cwd: path.join(REPO_PATH, 'backend')
      })
    } else {
      // System gem requires elevated privileges
      await sudoSh(`gem install bundler -v '${BUNDLER_VERSION}'`)
    }

    // mysql2 gem with library flags (platform-aware)
    const buildFlags = await getLibBuildFlags((cmd) => sh(cmd))
    await sh(
      `gem install mysql2 -- --with-ldflags="${buildFlags.ldflags}" --with-cppflags="${buildFlags.cppflags}"`,
      { cwd: path.join(REPO_PATH, 'backend') }
    )

    // tmuxinator (terminal multiplexer session manager)
    await sh('gem install tmuxinator')

    // Bundle config for native gem compilation
    if (isArm() || isLinux()) {
      await sh(
        `bundle config --global build.mysql2 "--with-opt-dir=${buildFlags.optDir} --with-ldflags=${buildFlags.ldflags} --with-cppflags=${buildFlags.cppflags}"`,
        { cwd: path.join(REPO_PATH, 'backend') }
      )
    }

    await sh('bundle install', { cwd: path.join(REPO_PATH, 'backend'), interactive: true })

    // 2. Mobile + ATS deps
    onProgress(3, 'Installing mobile and ATS dependencies...')
    await sh('pnpm i', { cwd: path.join(REPO_PATH, 'mobile'), interactive: true })
    await sh('yarn install', {
      cwd: path.join(REPO_PATH, 'backend', 'components', 'ats'),
      interactive: true
    })

    // 3. Shadowdog
    onProgress(4, 'Running shadowdog...')
    await sh('pnpm shadowdog', { cwd: REPO_PATH, interactive: true })

    // 4. Docker compose
    onProgress(5, 'Starting docker-compose...')
    await sh('docker-compose up -d --force-recreate', {
      cwd: path.join(REPO_PATH, '.local-dev'),
      interactive: true
    })

    // 5. Wait for MySQL
    onProgress(6, 'Waiting for MySQL readiness...')
    const maxRetries = 10
    const retryInterval = 15
    let mysqlHealthy = false
    for (let i = 0; i < maxRetries; i++) {
      const health = await sh(
        'docker inspect --format=\'{{.State.Health.Status}}\' mysql 2>/dev/null || echo "starting"',
        { cwd: path.join(REPO_PATH, '.local-dev') }
      )
      if (health.stdout.trim() === 'healthy') {
        mysqlHealthy = true
        break
      }
      onProgress(6, `Waiting for MySQL (${i + 1}/${maxRetries})...`)
      await new Promise((r) => setTimeout(r, retryInterval * 1000))
    }
    if (!mysqlHealthy) {
      throw new Error('MySQL did not become healthy in time.')
    }

    // 6. DB restore or create
    if (config.restoreDb) {
      onProgress(7, 'Restoring database from backup...')
      await sh(
        'bundle exec rails db:drop db:create db:seeds:restore db:migrate:with_data dev:enable_default_features db:test:prepare',
        { cwd: path.join(REPO_PATH, 'backend'), interactive: true }
      )
    } else {
      onProgress(7, 'Creating database...')
      await sh('bundle exec rails db:create db:migrate db:test:prepare', {
        cwd: path.join(REPO_PATH, 'backend'),
        interactive: true
      })
    }

    // 7. Done — no editor or browser opened; the finished pane shows next steps

    return { success: true, duration: Date.now() - start }
  } catch (e: any) {
    return { success: false, error: e.message, duration: Date.now() - start }
  }
}

/** Step 13: Install agent skills */
export async function runStep13(
  config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    for (let i = 0; i < SKILL_REPOS.length; i++) {
      const repo = SKILL_REPOS[i]!
      onProgress(i, `npx skills add ${repo}...`)
      const result = await sh(`npx skills add "${repo}" -g -y`, { interactive: true })
      if (result.code !== 0) {
        // Non-fatal: log but continue
      }
    }

    return { success: true, duration: Date.now() - start }
  } catch (e: any) {
    return { success: false, error: e.message, duration: Date.now() - start }
  }
}

// ── Task runner map ─────────────────────────────────────
export type TaskRunner = (config: SetupConfig, onProgress: ProgressCallback) => Promise<TaskResult>

export const TASK_RUNNERS: Record<number, TaskRunner> = {
  1: runStep1,
  2: runStep2,
  3: runStep3,
  4: runStep4,
  5: runStep5,
  6: runStep6,
  7: runStep7,
  8: runStep8,
  9: runStep9,
  10: runStep10,
  11: runStep11,
  12: runStep12,
  13: runStep13
}

// ── SSH Setup Helpers (used by SSHSetup wizard step) ────

/** Quick check: can we already access factorialco/factorial via SSH with default config? */
export async function checkGitHubConnectivity(): Promise<boolean> {
  const sshOpts = '-o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=no'
  const result = await sh(
    `GIT_SSH_COMMAND="ssh ${sshOpts}" git ls-remote git@github.com:${ORG_NAME}/${REPO_NAME}.git 2>/dev/null`,
    { timeout: 10000 }
  )
  return result.code === 0
}

/** Search for existing SSH private keys */
export async function findExistingSSHKeys(): Promise<string[]> {
  await mkdir(SSH_DIR, { recursive: true })
  const findResult = await sh(
    `find ${SSH_DIR} -maxdepth 1 -type f -not -name "*.pub" -not -name "config" -not -name "known_hosts" -not -name "known_hosts.old" -not -name "authorized_keys" -exec grep -l "PRIVATE KEY" {} \\; 2>/dev/null || true`,
    { timeout: 5000 }
  )
  return findResult.stdout.split('\n').filter(Boolean)
}

/** Test if an SSH key can access the Factorial org repo */
export async function testSSHKeyAccess(keyPath: string): Promise<boolean> {
  const sshOpts = `-i '${keyPath}' -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=5`
  const test = await sh(
    `ssh ${sshOpts} -T git@github.com 2>&1 || true`,
    { timeout: 15000 }
  )
  if (!test.stdout.includes('successfully authenticated')) return false

  const repoAccess = await sh(
    `GIT_SSH_COMMAND="ssh ${sshOpts}" git ls-remote git@github.com:${ORG_NAME}/${REPO_NAME}.git 2>/dev/null`,
    { timeout: 15000 }
  )
  return repoAccess.code === 0
}

/** Find a working SSH key from existing keys */
export async function findWorkingSSHKey(): Promise<string | null> {
  const keys = await findExistingSSHKeys()
  for (const key of keys) {
    if (await testSSHKeyAccess(key)) return key
  }
  return null
}

/** Generate a new SSH key and configure ~/.ssh/config */
export async function generateSSHKey(email: string): Promise<{ keyPath: string; publicKey: string }> {
  const keyName = `id_ed25519_factorial_${Math.floor(Date.now() / 1000)}`
  const keyFile = path.join(SSH_DIR, keyName)

  await sh(`ssh-keygen -t ed25519 -C "${email}" -f "${keyFile}" -N ""`)

  // Configure SSH config
  const sshConfigFile = path.join(SSH_DIR, 'config')
  let sshConfig = ''
  if (await fileExists(sshConfigFile)) {
    sshConfig = await readFile(sshConfigFile, 'utf-8')
  }
  if (!sshConfig.includes('Host github.com')) {
    const block = `\nHost github.com\n    HostName github.com\n    User git\n    IdentityFile ${keyFile}\n    IdentitiesOnly yes\n`
    await appendFile(sshConfigFile, block)
  }

  // Add to SSH agent (timeout in case it prompts for passphrase)
  await sh(getSshAddCommand(keyFile), { timeout: 5000 })

  const publicKey = await readFile(`${keyFile}.pub`, 'utf-8')
  return { keyPath: keyFile, publicKey: publicKey.trim() }
}

/** Copy text to clipboard */
export async function copyToClipboard(text: string): Promise<void> {
  await sh(getClipboardCommand(text))
}

/** Open a URL in the default browser */
export async function openURL(url: string): Promise<void> {
  await sh(getOpenCommand(url))
}

/** Verify SSO authorization for a given SSH key */
export async function verifySSHAccess(keyPath: string): Promise<boolean> {
  const sshOpts = `-i '${keyPath}' -o IdentitiesOnly=yes -o StrictHostKeyChecking=no -o BatchMode=yes -o ConnectTimeout=5`
  const result = await sh(
    `GIT_SSH_COMMAND="ssh ${sshOpts}" git ls-remote git@github.com:${ORG_NAME}/${REPO_NAME}.git 2>/dev/null`,
    { timeout: 15000 }
  )
  return result.code === 0
}

/** Configure SSH config for an existing key */
export async function configureSSHKey(keyPath: string): Promise<void> {
  const sshConfigFile = path.join(SSH_DIR, 'config')
  let sshConfig = ''
  if (await fileExists(sshConfigFile)) {
    sshConfig = await readFile(sshConfigFile, 'utf-8')
  }
  if (!sshConfig.includes('Host github.com')) {
    const block = `\nHost github.com\n    HostName github.com\n    User git\n    IdentityFile ${keyPath}\n    IdentitiesOnly yes\n`
    await appendFile(sshConfigFile, block)
  }
  await sh(getSshAddCommand(keyPath), { timeout: 5000 })
}

// ── AWS Setup Helpers (used by AWSSetup wizard step) ────

/** Check if AWS CLI is installed */
export async function checkAWSCLI(): Promise<boolean> {
  const result = await sh('aws --version 2>/dev/null')
  return result.code === 0
}

/** Install AWS CLI using the platform package manager */
export async function installAWSCLI(): Promise<{ success: boolean; error?: string }> {
  try {
    // On macOS, ensure Homebrew is installed before attempting brew install
    await ensureHomebrew()
    const installCmd = await getNativeInstallCommand(['awscli'])
    const result = await sh(installCmd, { interactive: true, timeout: 120000 })
    if (result.code !== 0) {
      return { success: false, error: `Package install failed: ${result.stderr || 'unknown error'}` }
    }
    // Verify it installed
    const verify = await checkAWSCLI()
    return verify
      ? { success: true }
      : { success: false, error: 'Package installed but aws command not found in PATH.' }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

/** Check if ~/.aws/config exists */
export async function hasAWSConfig(): Promise<boolean> {
  const awsConfigPath = path.join(HOME, '.aws', 'config')
  return fileExists(awsConfigPath)
}

/** Ensure a minimal AWS config with the development profile exists (only if no config file present) */
export async function ensureAWSProfileConfig(): Promise<void> {
  const awsDir = path.join(HOME, '.aws')
  const configPath = path.join(awsDir, 'config')

  // Only write if no config file exists at all
  if (await fileExists(configPath)) {
    return
  }

  const profileConfig = `[profile development]
sso_start_url = https://factorial-main.awsapps.com/start
sso_region = eu-central-1
sso_account_id = 800301453252
sso_role_name = Developer_AWS-Development
region = eu-central-1
output = json
`

  await mkdir(awsDir, { recursive: true })
  await writeFile(configPath, profileConfig)
}

/** Check if an active AWS SSO session exists */
export async function checkAWSSession(): Promise<boolean> {
  const result = await sh(
    `aws sts --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" get-caller-identity 2>/dev/null`
  )
  return result.code === 0
}

/** Run AWS SSO login (interactive — opens browser) */
export async function runAWSSSOLogin(): Promise<{ success: boolean; error?: string }> {
  const result = await sh(
    `aws sso --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" login`,
    { interactive: true }
  )
  if (result.code !== 0) {
    return { success: false, error: 'AWS SSO login failed. Please contact support or security teams asking for AWS SSO access.' }
  }
  // Verify it worked
  const verify = await sh(
    `aws sts --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" get-caller-identity`
  )
  return verify.code === 0
    ? { success: true }
    : { success: false, error: 'AWS SSO login completed but verification failed.' }
}

/** Get the AWS caller identity (for display) */
export async function getAWSCallerIdentity(): Promise<string | null> {
  const result = await sh(
    `aws sts --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" get-caller-identity --output json 2>/dev/null`
  )
  if (result.code !== 0) return null
  try {
    const identity = JSON.parse(result.stdout)
    return identity.Arn || null
  } catch {
    return null
  }
}
