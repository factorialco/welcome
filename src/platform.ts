import { readFile } from 'node:fs/promises'
import { platform as osPlatform, arch as osArch } from 'node:os'
import { homedir } from 'node:os'
import path from 'node:path'

// ── Platform & Distro Detection ────────────────────────

export type Platform = 'darwin' | 'linux'
export type LinuxDistro = 'ubuntu' | 'debian' | 'arch' | 'manjaro' | 'unknown'

let cachedDistro: LinuxDistro | null = null

export function getPlatform(): Platform {
  const p = osPlatform()
  if (p === 'darwin') return 'darwin'
  if (p === 'linux') return 'linux'
  throw new Error(`Unsupported platform: ${p}. Only macOS and Linux are supported.`)
}

export function isDarwin(): boolean {
  return getPlatform() === 'darwin'
}

export function isLinux(): boolean {
  return getPlatform() === 'linux'
}

/** Detect the Linux distribution from /etc/os-release */
export async function getLinuxDistro(): Promise<LinuxDistro> {
  if (cachedDistro) return cachedDistro

  try {
    const content = await readFile('/etc/os-release', 'utf-8')
    const idLine = content.split('\n').find((l: string) => l.startsWith('ID='))
    const id = idLine?.split('=')[1]?.replace(/"/g, '').trim().toLowerCase() ?? ''

    if (id === 'ubuntu' || id === 'debian' || id === 'linuxmint' || id === 'pop') {
      cachedDistro = id === 'ubuntu' || id === 'linuxmint' || id === 'pop' ? 'ubuntu' : 'debian'
    } else if (id === 'arch' || id === 'manjaro' || id === 'endeavouros') {
      cachedDistro = id === 'arch' || id === 'endeavouros' ? 'arch' : 'manjaro'
    } else {
      cachedDistro = 'unknown'
    }
  } catch {
    cachedDistro = 'unknown'
  }

  return cachedDistro
}

/** Returns true if the distro uses apt (Debian/Ubuntu family) */
export async function isAptBased(): Promise<boolean> {
  const distro = await getLinuxDistro()
  return distro === 'ubuntu' || distro === 'debian'
}

/** Returns true if the distro uses pacman (Arch family) */
export async function isPacmanBased(): Promise<boolean> {
  const distro = await getLinuxDistro()
  return distro === 'arch' || distro === 'manjaro'
}

/** Get a human-friendly label for the current platform/distro */
export async function getPlatformLabel(): Promise<string> {
  if (isDarwin()) return 'macOS'
  const distro = await getLinuxDistro()
  const labels: Record<LinuxDistro, string> = {
    ubuntu: 'Ubuntu',
    debian: 'Debian',
    arch: 'Arch Linux',
    manjaro: 'Manjaro',
    unknown: 'Linux',
  }
  return labels[distro]
}

// ── Shell Detection ────────────────────────────────────

export type ShellType = 'zsh' | 'bash'

/** Get the user's default shell */
export function getUserShell(): ShellType {
  const shell = process.env.SHELL || '/bin/bash'
  if (shell.includes('zsh')) return 'zsh'
  return 'bash'
}

/** Get shell arguments for running a login shell command */
export function getShellArgs(): [string, string[]] {
  const shell = getUserShell()
  // Use login + interactive flag patterns per shell
  return [shell, ['-lc']]
}

/** Get the appropriate shell profile file (sourced on login) */
export function getShellProfile(): string {
  const home = homedir()
  const shell = getUserShell()
  if (shell === 'zsh') return path.join(home, '.zprofile')
  return path.join(home, '.bash_profile')
}

/** Get the appropriate shell RC file (sourced on interactive shell) */
export function getShellRc(): string {
  const home = homedir()
  const shell = getUserShell()
  if (shell === 'zsh') return path.join(home, '.zshrc')
  return path.join(home, '.bashrc')
}

// ── Cross-Platform Command Equivalents ─────────────────

/** Copy text to clipboard */
export function getClipboardCommand(text: string): string {
  if (isDarwin()) {
    return `echo "${text}" | pbcopy`
  }
  // Linux: try wl-copy (Wayland) first, fall back to xclip
  return `echo "${text}" | (wl-copy 2>/dev/null || xclip -sel clipboard 2>/dev/null || xsel --clipboard --input 2>/dev/null || true)`
}

/** Open a URL in the default browser */
export function getOpenCommand(url: string): string {
  if (isDarwin()) {
    return `open "${url}" 2>/dev/null || true`
  }
  return `xdg-open "${url}" 2>/dev/null || true`
}

/** Add SSH key to the system keyring/agent */
export function getSshAddCommand(keyFile: string): string {
  if (isDarwin()) {
    return `ssh-add --apple-use-keychain "${keyFile}" 2>/dev/null || true`
  }
  // On Linux, just use ssh-add (GNOME Keyring or ssh-agent will handle it)
  return `ssh-add "${keyFile}" 2>/dev/null || true`
}

/** Get total system RAM in bytes */
export function getRamCommand(): string {
  if (isDarwin()) {
    return 'sysctl -n hw.memsize'
  }
  // On Linux, parse /proc/meminfo (MemTotal is in kB)
  return "awk '/MemTotal/{print $2 * 1024}' /proc/meminfo"
}

/** Get the OS version number */
export function getOsVersionCommand(): string {
  if (isDarwin()) {
    return 'sw_vers -productVersion | cut -d. -f1'
  }
  // On Linux, return the VERSION_ID from os-release
  return "grep '^VERSION_ID=' /etc/os-release | cut -d= -f2 | tr -d '\"'"
}

/** Get a unique machine identifier */
export function getMachineIdCommand(): string {
  if (isDarwin()) {
    return "ioreg -rd1 -c IOPlatformExpertDevice | awk -F'\"' '/IOPlatformUUID/{print tolower($4)}'"
  }
  // On Linux, /etc/machine-id is standard on systemd distros
  return 'cat /etc/machine-id'
}

/** Get the Docker Desktop app check path (macOS only) */
export function getDockerDesktopCheckPath(): string | null {
  if (isDarwin()) {
    return '/Applications/Docker.app'
  }
  // On Linux, Docker Desktop is not common; no specific path to check
  return null
}

// ── Architecture Detection ─────────────────────────────

export function getArch(): 'arm64' | 'x64' {
  return osArch() as 'arm64' | 'x64'
}

export function isArm(): boolean {
  return getArch() === 'arm64'
}

// ── Package Manager Abstraction ────────────────────────

/** Package name mappings: brew name -> apt name */
const APT_PACKAGE_MAP: Record<string, string | string[] | null> = {
  // Core tools
  mise: null, // Installed via its own installer on Linux
  asdf: null, // Installed via git clone on Linux
  awscli: 'awscli',
  bat: 'bat',
  direnv: 'direnv',
  fzf: 'fzf',
  gh: 'gh', // Needs separate repo setup
  git: 'git',
  gitleaks: null, // Installed via binary release
  htop: 'htop',
  imagemagick: 'imagemagick',
  jq: 'jq',
  lazydocker: null, // Installed via binary release
  libvips: 'libvips-dev',
  libyaml: 'libyaml-dev',
  make: 'make',
  mysql: ['default-mysql-client', 'default-libmysqlclient-dev'],
  nss: 'libnss3-tools',
  openssl: 'libssl-dev',
  'pkg-config': 'pkg-config',
  'build-essential': 'build-essential',
  'pdftk-java': 'pdftk-java',
  ripgrep: 'ripgrep',
  semgrep: null, // Installed via pip
  'shared-mime-info': 'shared-mime-info',
  watchman: null, // Build from source or use binary
  zstd: ['zstd', 'libzstd-dev'],
  gpg: 'gnupg',
  composer: 'composer',
  yq: null, // Installed via binary release
  tmux: 'tmux',
  // Agentic CLIs
  opencode: null, // Installed via npm/binary
  'claude-code': null, // Installed via npm
  codex: null, // Installed via npm
}

/** Package name mappings: brew name -> pacman name */
const PACMAN_PACKAGE_MAP: Record<string, string | string[] | null> = {
  mise: null, // AUR: mise-bin
  asdf: null, // AUR: asdf-vm
  awscli: 'aws-cli-v2',
  bat: 'bat',
  direnv: 'direnv',
  fzf: 'fzf',
  gh: 'github-cli',
  git: 'git',
  gitleaks: 'gitleaks',
  htop: 'htop',
  imagemagick: 'imagemagick',
  jq: 'jq',
  lazydocker: 'lazydocker',
  libvips: 'libvips',
  libyaml: 'libyaml',
  make: 'make',
  mysql: ['mariadb-clients', 'mariadb-libs'],
  nss: 'nss',
  openssl: 'openssl',
  'pkg-config': 'pkgconf',
  'build-essential': 'base-devel',
  'pdftk-java': null, // AUR: pdftk
  ripgrep: 'ripgrep',
  semgrep: null, // pip install semgrep
  'shared-mime-info': 'shared-mime-info',
  watchman: null, // AUR: watchman-bin
  zstd: 'zstd',
  gpg: 'gnupg',
  composer: 'composer',
  yq: 'yq',
  tmux: 'tmux',
  opencode: null,
  'claude-code': null,
  codex: null,
}

/** AUR packages for Arch (installed via yay/paru) */
const AUR_PACKAGES: Record<string, string> = {
  mise: 'mise-bin',
  asdf: 'asdf-vm',
  gitleaks: 'gitleaks', // also in community
  lazydocker: 'lazydocker', // also in community
  watchman: 'watchman-bin',
  'pdftk-java': 'pdftk',
  yq: 'yq', // also in community
}

/** Packages that need special installation on Linux (not in standard repos) */
const SPECIAL_INSTALL_COMMANDS_APT: Record<string, string[]> = {
  gh: [
    'type -p curl >/dev/null || sudo apt-get install -y curl',
    'curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg',
    'sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg',
    'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null',
    'sudo apt-get update',
    'sudo apt-get install -y gh',
  ],
  mise: [
    'curl https://mise.jdx.dev/install.sh | sh',
  ],
  gitleaks: [
    'GITLEAKS_VERSION=$(curl -s https://api.github.com/repos/gitleaks/gitleaks/releases/latest | jq -r .tag_name | tr -d v) && curl -sSL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_$(dpkg --print-architecture | sed s/amd64/x64/).tar.gz" | sudo tar -xz -C /usr/local/bin gitleaks',
  ],
  lazydocker: [
    'curl https://raw.githubusercontent.com/jesseduffield/lazydocker/master/scripts/install_update_linux.sh | bash',
  ],
  watchman: [
    // Skip watchman on Linux if not easily available - it's optional
  ],
  semgrep: [
    'pip3 install semgrep || python3 -m pip install semgrep',
  ],
  yq: [
    'YQ_VERSION=$(curl -s https://api.github.com/repos/mikefarah/yq/releases/latest | jq -r .tag_name) && sudo curl -sSL "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_$(dpkg --print-architecture)" -o /usr/local/bin/yq && sudo chmod +x /usr/local/bin/yq',
  ],
}

const SPECIAL_INSTALL_COMMANDS_PACMAN: Record<string, string[]> = {
  mise: [
    'curl https://mise.jdx.dev/install.sh | sh',
  ],
  semgrep: [
    'pip install semgrep || python -m pip install semgrep',
  ],
}

export type PackageInstallPlan = {
  /** Packages installable via the native package manager */
  nativePackages: string[]
  /** AUR packages (Arch only) */
  aurPackages: string[]
  /** Commands for packages requiring special installation */
  specialInstalls: Array<{ name: string; commands: string[] }>
  /** Packages that will be skipped (not available) */
  skippedPackages: string[]
}

/** Build an install plan for the given brew formula names */
export async function buildPackageInstallPlan(brewNames: string[]): Promise<PackageInstallPlan> {
  const platform = getPlatform()
  const plan: PackageInstallPlan = {
    nativePackages: [],
    aurPackages: [],
    specialInstalls: [],
    skippedPackages: [],
  }

  if (platform === 'darwin') {
    // On macOS, all packages go through brew
    plan.nativePackages = brewNames
    return plan
  }

  const isApt = await isAptBased()
  const isPacman = await isPacmanBased()
  const pkgMap = isApt ? APT_PACKAGE_MAP : PACMAN_PACKAGE_MAP
  const specialMap = isApt ? SPECIAL_INSTALL_COMMANDS_APT : SPECIAL_INSTALL_COMMANDS_PACMAN

  for (const name of brewNames) {
    // Check if there's a special install command
    if (specialMap[name]) {
      plan.specialInstalls.push({ name, commands: specialMap[name]! })
      continue
    }

    const mapped = pkgMap[name]
    if (mapped === null) {
      plan.skippedPackages.push(name)
      continue
    }
    if (mapped === undefined) {
      plan.skippedPackages.push(name)
      continue
    }
    if (Array.isArray(mapped)) {
      plan.nativePackages.push(...mapped)
    } else {
      plan.nativePackages.push(mapped)
    }
  }

  // On Arch, check for AUR packages among skipped
  if (isPacman) {
    const newSkipped: string[] = []
    for (const name of plan.skippedPackages) {
      if (AUR_PACKAGES[name]) {
        plan.aurPackages.push(AUR_PACKAGES[name]!)
      } else {
        newSkipped.push(name)
      }
    }
    plan.skippedPackages = newSkipped
  }

  return plan
}

/** Get the native package manager install command */
export async function getNativeInstallCommand(packages: string[]): Promise<string> {
  if (isDarwin()) {
    // This shouldn't be called for macOS (we use brew bundle), but just in case
    return `brew install ${packages.join(' ')}`
  }
  if (await isAptBased()) {
    return `sudo apt-get install -y ${packages.join(' ')}`
  }
  if (await isPacmanBased()) {
    return `sudo pacman -S --noconfirm --needed ${packages.join(' ')}`
  }
  throw new Error('Unsupported Linux distribution for package installation')
}

/** Get the AUR helper install command (Arch only) */
export function getAurInstallCommand(packages: string[]): string {
  return `yay -S --noconfirm --needed ${packages.join(' ')} || paru -S --noconfirm --needed ${packages.join(' ')}`
}

// ── Library Path Helpers ───────────────────────────────

/** Get library include/link flags for compiling native gems (e.g., mysql2) */
export async function getLibBuildFlags(
  shFn: (cmd: string) => Promise<{ code: number; stdout: string; stderr: string }>
): Promise<{ ldflags: string; cppflags: string; optDir: string }> {
  if (isDarwin()) {
    const zstdPrefix = (await shFn('brew --prefix zstd')).stdout.trim()
    const opensslPrefix = (await shFn('brew --prefix openssl')).stdout.trim()
    return {
      ldflags: `-L${zstdPrefix}/lib`,
      cppflags: `-I${zstdPrefix}/include`,
      optDir: opensslPrefix,
    }
  }

  // On Linux, use pkg-config or standard paths
  const zstdLibDir =
    (await shFn('pkg-config --libs-only-L zstd 2>/dev/null')).stdout.trim() || '-L/usr/lib'
  const zstdIncDir =
    (await shFn('pkg-config --cflags-only-I zstd 2>/dev/null')).stdout.trim() || '-I/usr/include'

  return {
    ldflags: zstdLibDir,
    cppflags: zstdIncDir,
    optDir: '/usr',
  }
}

// ── Docker Setup Helpers ───────────────────────────────

/** Get Docker installation commands for the current platform */
export async function getDockerInstallStrategy(): Promise<'colima' | 'native'> {
  if (isDarwin()) return 'colima'
  return 'native'
}

/** Get commands to install Docker natively on Linux */
export async function getDockerNativeInstallCommands(): Promise<string[]> {
  if (await isAptBased()) {
    return [
      // Install prerequisites
      'sudo apt-get update',
      'sudo apt-get install -y ca-certificates curl gnupg',
      // Add Docker's official GPG key
      'sudo install -m 0755 -d /etc/apt/keyrings',
      'curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg 2>/dev/null || true',
      'sudo chmod a+r /etc/apt/keyrings/docker.gpg',
      // Set up the repository
      'echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/$(. /etc/os-release && echo "$ID") $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null',
      'sudo apt-get update',
      // Install Docker Engine
      'sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin',
      // Add user to docker group
      `sudo usermod -aG docker $USER`,
      // Install docker-compose standalone (for compatibility)
      'sudo apt-get install -y docker-compose-plugin',
      // Install ECR credential helper
      'sudo apt-get install -y amazon-ecr-credential-helper || true',
    ]
  }

  if (await isPacmanBased()) {
    return [
      'sudo pacman -S --noconfirm --needed docker docker-compose docker-buildx',
      `sudo usermod -aG docker $USER`,
      'sudo systemctl enable --now docker',
    ]
  }

  throw new Error('Unsupported Linux distribution for Docker installation')
}

/** Get command to enable Docker service on boot */
export async function getDockerServiceCommands(): Promise<string[]> {
  if (isDarwin()) {
    return [
      'brew services start colima 2>/dev/null || true',
    ]
  }
  return [
    'sudo systemctl enable docker',
    'sudo systemctl start docker',
  ]
}

// ── GUI App Installation (casks equivalent) ────────────

export type GuiAppInstallPlan = {
  commands: string[]
  skipped: string[]
}

/** Build installation plan for GUI apps (Homebrew casks on macOS, native packages on Linux) */
export async function buildGuiAppInstallPlan(
  apps: Array<{ brewCask: string; name: string }>
): Promise<GuiAppInstallPlan> {
  const plan: GuiAppInstallPlan = { commands: [], skipped: [] }

  if (isDarwin()) {
    // Handled by Brewfile, not needed here
    return plan
  }

  for (const app of apps) {
    switch (app.brewCask) {
      case 'cursor':
        // Cursor doesn't have official Linux packages; use AppImage
        plan.commands.push(
          'curl -fsSL "https://www.cursor.com/api/download?platform=linux-x64&releaseTrack=stable" -o /tmp/cursor.appimage && chmod +x /tmp/cursor.appimage && sudo mv /tmp/cursor.appimage /usr/local/bin/cursor || true'
        )
        break
      case 'visual-studio-code':
        if (await isAptBased()) {
          plan.commands.push(
            'curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | sudo gpg --dearmor -o /usr/share/keyrings/packages.microsoft.gpg 2>/dev/null || true',
            'echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" | sudo tee /etc/apt/sources.list.d/vscode.list > /dev/null',
            'sudo apt-get update && sudo apt-get install -y code'
          )
        } else if (await isPacmanBased()) {
          plan.commands.push(
            'yay -S --noconfirm visual-studio-code-bin || paru -S --noconfirm visual-studio-code-bin || sudo pacman -S --noconfirm code'
          )
        }
        break
      case 'font-fira-code-nerd-font':
        if (await isAptBased()) {
          plan.commands.push('sudo apt-get install -y fonts-firacode || true')
        } else if (await isPacmanBased()) {
          plan.commands.push('sudo pacman -S --noconfirm --needed ttf-fira-code')
        }
        break
      case 'iterm2':
        // iTerm2 is macOS only; skip on Linux
        plan.skipped.push('iterm2 (macOS only)')
        break
      case 'session-manager-plugin':
        if (await isAptBased()) {
          plan.commands.push(
            'curl -fsSL "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_$(dpkg --print-architecture | sed s/amd64/64bit/)/session-manager-plugin.deb" -o /tmp/session-manager-plugin.deb && sudo dpkg -i /tmp/session-manager-plugin.deb && rm /tmp/session-manager-plugin.deb || true'
          )
        } else if (await isPacmanBased()) {
          plan.commands.push(
            'yay -S --noconfirm aws-session-manager-plugin || paru -S --noconfirm aws-session-manager-plugin || true'
          )
        }
        break
      case 'libreoffice':
        if (await isAptBased()) {
          plan.commands.push('sudo apt-get install -y libreoffice')
        } else if (await isPacmanBased()) {
          plan.commands.push('sudo pacman -S --noconfirm --needed libreoffice-still')
        }
        break
      case 'ngrok':
        if (await isAptBased()) {
          plan.commands.push(
            'curl -sSL https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null',
            'echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list',
            'sudo apt-get update && sudo apt-get install -y ngrok'
          )
        } else if (await isPacmanBased()) {
          plan.commands.push('yay -S --noconfirm ngrok || paru -S --noconfirm ngrok')
        }
        break
      default:
        plan.skipped.push(app.brewCask)
    }
  }

  return plan
}
