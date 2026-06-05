import { type SetupConfig } from "../../context/index.js";
import {
  CONDUCTOR_ECR_REGISTRY,
  LOCAL_AWS_DEFAULT_REGION,
  LOCAL_AWS_PROFILE,
} from "../constants.js";
import {
  getErrorMessage,
  sh,
  type ProgressCallback,
  type TaskResult,
} from "../helpers.js";

/** Step 12: Conductor ECR login — authenticate Docker with the Conductor
 *  registry so the conductor image can be pulled (runs before step 13). */
export async function runStep12(
  _config: SetupConfig,
  onProgress: ProgressCallback,
): Promise<TaskResult> {
  const start = Date.now();
  try {
    onProgress(0, `Logging in to ${CONDUCTOR_ECR_REGISTRY}...`);
    const login = await sh(
      `aws ecr get-login-password --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" | docker login --username AWS --password-stdin ${CONDUCTOR_ECR_REGISTRY}`,
      { interactive: true },
    );
    if (login.code !== 0) {
      throw new Error(
        `Failed to authenticate Docker with ECR (${CONDUCTOR_ECR_REGISTRY}). Ensure your AWS SSO session is active.`,
      );
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
