import { type SetupConfig } from "../../context/index.js";
import { PERSONAL_ENV_RC_PATH } from "../constants.js";
import {
  addOrUpdateEnvVar,
  getErrorMessage,
  sh,
  shellEscape,
  type ProgressCallback,
  type TaskResult,
} from "../helpers.js";

/** Step 10: Configure Ngrok tunnel */
export async function runStep10(
  config: SetupConfig,
  onProgress: ProgressCallback,
): Promise<TaskResult> {
  const start = Date.now();
  try {
    if (!config.setupNgrok) {
      return { success: true, duration: Date.now() - start };
    }

    // 1. Configure domain
    onProgress(
      0,
      `Configuring Ngrok domain: ${config.ngrokDomain || "default"}...`,
    );
    if (config.ngrokDomain) {
      await addOrUpdateEnvVar(
        "TUNNEL_DOMAIN",
        config.ngrokDomain,
        PERSONAL_ENV_RC_PATH,
      );
    }

    // 2. Set authtoken
    onProgress(1, "Setting authtoken...");
    if (config.ngrokAuthtoken) {
      await sh(
        `ngrok config add-authtoken ${shellEscape(config.ngrokAuthtoken)}`,
      );
      await addOrUpdateEnvVar(
        "TUNNEL_AUTH_TOKEN",
        config.ngrokAuthtoken,
        PERSONAL_ENV_RC_PATH,
      );
    }

    // 3. Test tunnel
    onProgress(2, "Testing tunnel...");
    if (config.ngrokDomain && config.ngrokAuthtoken) {
      const configCheck = await sh("ngrok config check 2>/dev/null");
      if (configCheck.code !== 0) {
        throw new Error("Ngrok configuration check failed.");
      }

      // Quick tunnel test
      const testResult = await sh(
        `ngrok http --url=${shellEscape(config.ngrokDomain)} 9999 --log=stdout --log-format=logfmt --authtoken=${shellEscape(config.ngrokAuthtoken)} &
        NGROK_PID=$!
        sleep 3
        kill $NGROK_PID 2>/dev/null
        wait $NGROK_PID 2>/dev/null || true`,
      );
      // If we got here without "authentication failed", we're good
      if (
        testResult.stdout.includes("authentication failed") ||
        testResult.stderr.includes("authentication failed")
      ) {
        throw new Error("Ngrok authentication failed.");
      }
    }

    // 4. Save to .envrc.personal
    onProgress(3, "Saving to .envrc.personal...");

    return { success: true, duration: Date.now() - start };
  } catch (e) {
    return {
      success: false,
      error: getErrorMessage(e),
      duration: Date.now() - start,
    };
  }
}
