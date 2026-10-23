import { type SetupConfig } from '../../context/index.js'
import { LOG_FILE, REPO_PATH } from '../constants.js'
import { getErrorMessage, sh, type ProgressCallback, type TaskResult } from '../helpers.js'

/** Step 7: Update secrets with the monolith's own script, which reads them
 *  from Azure Key Vault (falling back to AWS Secrets Manager). */
export async function runStep7(
  _config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    onProgress(0, 'Running .local-dev/scripts/update-secrets.sh...')
    const result = await sh('.local-dev/scripts/update-secrets.sh', {
      cwd: REPO_PATH,
      interactive: true,
    })
    if (result.code !== 0) {
      const tail = (result.stderr || result.stdout).split('\n').slice(-15).join('\n')
      throw new Error(
        `Failed to update secrets (exit ${result.code})` +
          `${tail ? `\n${tail}` : ''}` +
          `\nIf this does not explain it, post it in #local-development. Full output: ${LOG_FILE}`
      )
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
