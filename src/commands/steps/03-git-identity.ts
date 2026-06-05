import { type SetupConfig } from "../../context/index.js";
import {
  getErrorMessage,
  sh,
  shellEscape,
  type ProgressCallback,
  type TaskResult,
} from "../helpers.js";
import { checkGitHubConnectivity, verifySSHAccess } from "../ssh.js";

/** Step 3: Configure git identity (SSH is handled by the SSHSetup wizard step) */
export async function runStep3(
  config: SetupConfig,
  onProgress: ProgressCallback,
): Promise<TaskResult> {
  const start = Date.now();
  try {
    // Set git identity
    onProgress(0, "Configuring git identity...");
    if (config.fullName) {
      await sh(`git config --global user.name ${shellEscape(config.fullName)}`);
    }
    if (config.email) {
      await sh(`git config --global user.email ${shellEscape(config.email)}`);
    }

    // SSH was already set up in the SSHSetup wizard step.
    // Just verify it's still working.
    if (config.sshKeyPath) {
      onProgress(1, "Verifying SSH access...");
      const ok =
        config.sshKeyPath === "__default__"
          ? await checkGitHubConnectivity()
          : await verifySSHAccess(config.sshKeyPath);
      if (!ok) {
        throw new Error(
          "SSH key no longer has access. Please re-run the wizard.",
        );
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
