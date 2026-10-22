import { type SetupConfig } from '../../context/index.js'
import { REPO_PATH } from '../constants.js'
import { getErrorMessage, sh, type ProgressCallback, type TaskResult } from '../helpers.js'

/** Step 12: Conductor registry login — the monolith's own script logs Docker in
 *  to the Azure registry with a pull token read from Key Vault (runs before 13). */
export async function runStep12(
  _config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    onProgress(0, 'Running .local-dev/scripts/login-conductor-registry.sh...')
    const result = await sh('.local-dev/scripts/login-conductor-registry.sh', {
      cwd: REPO_PATH,
      interactive: true,
    })
    if (result.code !== 0) {
      throw new Error(
        'Conductor registry login failed. Run `az login` with your Factorial account and retry.'
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
