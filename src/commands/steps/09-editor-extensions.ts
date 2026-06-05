import { type SetupConfig } from "../../context/index.js";
import { CODE_DIR, EXTENSIONS } from "../constants.js";
import {
  dirExists,
  getErrorMessage,
  sh,
  type ProgressCallback,
  type TaskResult,
} from "../helpers.js";
import { readdir } from "node:fs/promises";
import path from "node:path";

/** Step 9: Install editor extensions */
export async function runStep9(
  config: SetupConfig,
  onProgress: ProgressCallback,
): Promise<TaskResult> {
  const start = Date.now();
  try {
    if (config.editors.length === 0) {
      onProgress(0, "Skipping editor extensions (no editors selected)...");
      return { success: true, duration: Date.now() - start };
    }

    for (const editor of config.editors) {
      const editorCmd = editor === "cursor" ? "cursor" : "code";
      const editorName = editor === "cursor" ? "Cursor" : "VS Code";
      const extensions = [...EXTENSIONS];

      // Add Copilot for VS Code users
      if (editor === "vscode") {
        extensions.push("github.copilot", "github.copilot-chat");
      }

      // 1. Install extensions
      onProgress(0, `Installing ${editorName} extensions...`);
      for (let i = 0; i < extensions.length; i++) {
        const ext = extensions[i]!;
        onProgress(
          1,
          `[${editorName}] Installing ${ext} (${i + 1}/${extensions.length})...`,
        );
        await sh(
          `${editorCmd} --install-extension "${ext}" --force 2>/dev/null || true`,
        );
      }

      // 2. Custom .vsix extensions (vscode-factorial, zengrep, etc.)
      onProgress(2, `[${editorName}] Cloning devenv-vscode-extensions...`);
      const extRepoPath = path.join(CODE_DIR, "devenv-vscode-extensions");
      if (!(await dirExists(extRepoPath))) {
        await sh(
          `git clone git@github.com:factorialco/devenv-vscode-extensions.git "${extRepoPath}"`,
          { interactive: true },
        );
      } else {
        await sh("git pull", { cwd: extRepoPath });
      }

      const distDir = path.join(extRepoPath, "dist");
      if (await dirExists(distDir)) {
        const files = await readdir(distDir);
        const vsixFiles = files.filter((f) => f.endsWith(".vsix"));
        for (let i = 0; i < vsixFiles.length; i++) {
          const file = vsixFiles[i]!;
          const vsixPath = path.join(distDir, file);
          onProgress(
            2,
            `[${editorName}] Installing ${file} (${i + 1}/${vsixFiles.length})...`,
          );
          await sh(
            `${editorCmd} --install-extension "${vsixPath}" --force 2>/dev/null || true`,
          );
        }
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
