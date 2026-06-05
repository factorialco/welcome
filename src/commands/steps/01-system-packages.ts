import { type SetupConfig } from "../../context/index.js";
import {
  buildGuiAppInstallPlan,
  buildPackageInstallPlan,
  getAurInstallCommand,
  getNativeInstallCommand,
  getPlatform,
} from "../../platform.js";
import {
  BASE_BREW_FORMULAE,
  CLI_BREW_CASK_MAP,
  CLI_BREW_FORMULAE_MAP,
  EDITOR_CASK_MAP,
  HOME,
  ROOT_DIR,
} from "../constants.js";
import {
  fileExists,
  getErrorMessage,
  sh,
  sudoSh,
  type ProgressCallback,
  type TaskResult,
} from "../helpers.js";
import { ensureHomebrew } from "../homebrew.js";
import { mkdir, writeFile } from "node:fs/promises";
import { arch as osArch } from "node:os";
import path from "node:path";

/** Step 1: Install system packages */
export async function runStep1(
  config: SetupConfig,
  onProgress: ProgressCallback,
): Promise<TaskResult> {
  const start = Date.now();
  try {
    const platform = getPlatform();
    const versionManager = config.versionManager === "mise" ? "mise" : "asdf";
    const cliFormulae = config.agenticClis
      .map((cli) => CLI_BREW_FORMULAE_MAP[cli])
      .filter(Boolean) as string[];
    const cliCasks = config.agenticClis
      .map((cli) => CLI_BREW_CASK_MAP[cli])
      .filter(Boolean) as string[];
    const allFormulae = [versionManager, ...BASE_BREW_FORMULAE, ...cliFormulae];

    if (platform === "darwin") {
      // ── macOS: Homebrew path ──
      onProgress(0, "Checking Homebrew installation...");
      await ensureHomebrew();

      // Generate Brewfile
      onProgress(1, "Generating Brewfile...");
      await mkdir(ROOT_DIR, { recursive: true });
      const cliBrewLines = cliFormulae.map((f) => `brew "${f}"`);
      const cliCaskLines = cliCasks.map((f) => `cask "${f}"`);
      const editorCaskLines = config.editors.map(
        (e) => `cask "${EDITOR_CASK_MAP[e]}"`,
      );

      const brewfile =
        [
          `brew "${versionManager}"`,
          ...BASE_BREW_FORMULAE.map((f) => `brew "${f}"`),
          ...cliBrewLines,
          "",
          'cask_args appdir: "/Applications"',
          ...editorCaskLines,
          ...cliCaskLines,
          'cask "font-fira-code-nerd-font"',
          'cask "iterm2"',
          'cask "libreoffice"',
          'cask "ngrok"',
        ].join("\n") + "\n";

      await writeFile(path.join(ROOT_DIR, "Brewfile"), brewfile);

      onProgress(2, "Running brew bundle install (this may take a while)...");
      const brewResult = await sh(
        `brew bundle --file="${ROOT_DIR}/Brewfile" --force --no-upgrade`,
        {
          interactive: true,
        },
      );
      if (brewResult.code !== 0) {
        throw new Error("brew bundle install failed");
      }

      // Install session-manager-plugin directly from AWS (Homebrew cask is deprecated)
      onProgress(2, "Installing AWS Session Manager plugin...");
      const smpArch = osArch() === "arm64" ? "mac_arm64" : "mac";
      await sh(
        `curl -fsSL "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/${smpArch}/sessionmanager-bundle.zip" -o /tmp/sessionmanager-bundle.zip && ` +
          `unzip -o /tmp/sessionmanager-bundle.zip -d /tmp`,
      );
      await sudoSh(
        `/tmp/sessionmanager-bundle/install -i /usr/local/sessionmanagerplugin -b /usr/local/bin/session-manager-plugin`,
      );
      await sh(
        `rm -rf /tmp/sessionmanager-bundle.zip /tmp/sessionmanager-bundle`,
      );
    } else {
      // ── Linux: native package manager path ──
      // Add build prerequisites that macOS gets from Xcode Command Line Tools
      const linuxFormulae = [...allFormulae, "pkg-config", "build-essential"];
      onProgress(0, "Building package install plan...");
      const plan = await buildPackageInstallPlan(linuxFormulae);

      // Install native packages
      if (plan.nativePackages.length > 0) {
        onProgress(
          1,
          `Installing ${plan.nativePackages.length} system packages...`,
        );
        // Ensure package index is up to date on apt-based systems
        await sh("sudo apt-get update 2>/dev/null || true", {
          interactive: true,
        });
        const installCmd = await getNativeInstallCommand(plan.nativePackages);
        const result = await sh(installCmd, { interactive: true });
        if (result.code !== 0) {
          throw new Error("System package installation failed");
        }
      }

      // Install AUR packages (Arch only)
      if (plan.aurPackages.length > 0) {
        onProgress(2, `Installing ${plan.aurPackages.length} AUR packages...`);
        await sh(getAurInstallCommand(plan.aurPackages), { interactive: true });
      }

      // Run special install commands
      for (let i = 0; i < plan.specialInstalls.length; i++) {
        const { name, commands } = plan.specialInstalls[i]!;
        onProgress(2, `Installing ${name}...`);
        for (const cmd of commands) {
          await sh(cmd, { interactive: true });
        }
      }

      // Install GUI apps
      onProgress(2, "Installing GUI applications...");
      const guiApps = [
        ...config.editors.map((e) => ({
          brewCask: EDITOR_CASK_MAP[e]!,
          name: e,
        })),
        { brewCask: "font-fira-code-nerd-font", name: "Fira Code Nerd Font" },
        { brewCask: "iterm2", name: "iTerm2" },
        { brewCask: "session-manager-plugin", name: "AWS Session Manager" },
        { brewCask: "libreoffice", name: "LibreOffice" },
        { brewCask: "ngrok", name: "ngrok" },
      ];
      const guiPlan = await buildGuiAppInstallPlan(guiApps);
      for (const cmd of guiPlan.commands) {
        await sh(cmd, { interactive: true });
      }

      if (plan.skippedPackages.length > 0) {
        // Log skipped packages (non-fatal)
        onProgress(
          2,
          `Note: skipped packages not available on this platform: ${plan.skippedPackages.join(", ")}`,
        );
      }
    }

    // Configure direnv (cross-platform)
    onProgress(3, "Configuring direnv...");
    const direnvConfigDir = path.join(HOME, ".config", "direnv");
    const direnvConfigFile = path.join(direnvConfigDir, "direnv.toml");
    if (!(await fileExists(direnvConfigFile))) {
      await mkdir(direnvConfigDir, { recursive: true });
      await writeFile(direnvConfigFile, "hide_env_diff = true\n");
    }

    return { success: true, duration: Date.now() - start };
  } catch (e) {
    return {
      success: false,
      error: getErrorMessage(e),
      duration: Date.now() - start,
    };
  }
}
