import { type SetupConfig } from "../../context/index.js";
import { getShellRc, getUserShell } from "../../platform.js";
import { HOME, REPO_PATH } from "../constants.js";
import {
  dirExists,
  ensureLine,
  fileExists,
  getErrorMessage,
  sh,
  sudoSh,
  type ProgressCallback,
  type TaskResult,
} from "../helpers.js";
import { copyFile } from "node:fs/promises";
import path from "node:path";

/** Step 5: Setup version manager (asdf or mise) */
export async function runStep5(
  config: SetupConfig,
  onProgress: ProgressCallback,
): Promise<TaskResult> {
  const start = Date.now();
  try {
    const plugins = ["rust", "ruby", "nodejs", "python"];
    const useMise = config.versionManager === "mise";
    const shellRc = getShellRc();
    const shell = getUserShell();

    // 0. Copy .factorialrc
    onProgress(0, "Copying .factorialrc...");
    const factorialrcSrc = path.join(REPO_PATH, ".local-dev", ".factorialrc");
    const factorialrcDst = path.join(HOME, ".factorialrc");
    if (await fileExists(factorialrcSrc)) {
      await copyFile(factorialrcSrc, factorialrcDst);
    }
    await ensureLine(shellRc, 'source "$HOME/.factorialrc"');

    if (useMise) {
      // 1. Add mise to PATH
      onProgress(1, "Setting up mise version manager...");
      await ensureLine(shellRc, `eval "$(mise activate ${shell})"`);

      // 2-5. Install plugins
      for (let i = 0; i < plugins.length; i++) {
        onProgress(i + 1, `Installing plugin: ${plugins[i]}...`);
        await sh(`mise use -g "${plugins[i]}@latest"`, {
          env: { RUBY_CONFIGURE_OPTS: "--enable-yjit" },
        });
      }

      // 6. Install rust specific version
      onProgress(5, "Installing Rust 1.96.0...");
      await sh("mise use -g rust@1.96.0");

      // 7. Install all versions from repo
      onProgress(6, "Installing all versions from .tool-versions...");
      await sh("mise install", { cwd: REPO_PATH, interactive: true });
    } else {
      // asdf
      onProgress(1, "Setting up asdf version manager...");
      const asdfPath =
        'export PATH="${ASDF_DATA_DIR:-$HOME/.asdf}/shims:$PATH"';
      await ensureLine(shellRc, asdfPath);

      for (let i = 0; i < plugins.length; i++) {
        const plugin = plugins[i]!;
        onProgress(i + 1, `Installing plugin: ${plugin}...`);
        const list = await sh("asdf plugin list");
        if (list.stdout.includes(plugin)) {
          await sh(`asdf plugin update ${plugin}`);
        } else {
          await sh(`asdf plugin add ${plugin}`);
        }
      }

      onProgress(5, "Installing Rust...");
      await sh("asdf install rust", { env: { ASDF_RUST_VERSION: "1.96.0" } });

      onProgress(6, "Installing all versions from .tool-versions...");
      await sh("asdf install", { cwd: REPO_PATH, interactive: true });

      // Fix permissions — resolve username now because sudoSh on macOS runs as
      // root (where $(whoami) would return "root").
      const asdfInstalls = path.join(HOME, ".asdf", "installs");
      if (await dirExists(asdfInstalls)) {
        const username = process.env.USER || (await sh("whoami")).stdout.trim();
        await sudoSh(`chown -R ${username} "${asdfInstalls}"`);
      }
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
