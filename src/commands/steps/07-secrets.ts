import { type SetupConfig } from "../../context/index.js";
import {
  LOCAL_AWS_DEFAULT_REGION,
  LOCAL_AWS_PROFILE,
  PERSONAL_ENV_RC_PATH,
  REPO_PATH,
} from "../constants.js";
import {
  fileExists,
  getErrorMessage,
  sh,
  type ProgressCallback,
  type TaskResult,
} from "../helpers.js";
import { writeFile } from "node:fs/promises";
import path from "node:path";

/** Step 7: Update secrets from AWS Secrets Manager */
export async function runStep7(
  _config: SetupConfig,
  onProgress: ProgressCallback,
): Promise<TaskResult> {
  const start = Date.now();
  try {
    const secretName = `${LOCAL_AWS_PROFILE}/factorial/env`;
    const secretsFile = path.join(REPO_PATH, ".envrc.localdev_secrets");

    // 1. Retrieve secret
    onProgress(0, "Retrieving development/factorial/env...");
    const secretCmd = `aws secretsmanager get-secret-value --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" --secret-id "${secretName}" --output json 2>/dev/null`;
    const result = await sh(secretCmd);
    if (result.code !== 0 || !result.stdout) {
      throw new Error("Failed to retrieve secret from AWS Secrets Manager.");
    }

    // 2. Parse and write secrets
    onProgress(1, "Writing .envrc.localdev_secrets...");
    const parseCmd = `echo '${result.stdout.replace(
      /'/g,
      "'\\''",
    )}' | jq -r '.SecretString' | perl -pe 's/[\\x00-\\x08\\x0B\\x0C\\x0E-\\x1F]/\\n/g; s/\\r//g' | awk '{printf "%s\\\\n", $0}' | sed 's/\\\\n$//' | jq -R 'fromjson' | jq -r 'to_entries[]' | jq -r 'if .value | length > 0 then "export " + .key + "=" + (.value | @json) else empty end'`;
    const parsed = await sh(parseCmd);
    if (parsed.code === 0) {
      await writeFile(secretsFile, parsed.stdout + "\n");
    }

    // Touch personal env file
    if (!(await fileExists(PERSONAL_ENV_RC_PATH))) {
      await writeFile(PERSONAL_ENV_RC_PATH, "");
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
