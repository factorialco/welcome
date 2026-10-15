import { type SetupConfig } from '../../context/index.js'
import { CONDUCTOR_ACR_NAME } from '../constants.js'
import { getErrorMessage, sh, type ProgressCallback, type TaskResult } from '../helpers.js'

/** Step 12: Conductor registry login — authenticate Docker with the Azure
 *  registry so the conductor images can be pulled (runs before step 13). */
export async function runStep12(
  _config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    onProgress(0, 'Logging in to Azure...')
    const session = await sh('az account show')
    if (session.code !== 0) {
      const login = await sh('az login --only-show-errors', { interactive: true })
      if (login.code !== 0) {
        throw new Error('Azure login failed. Run `az login` with your Factorial account.')
      }
    }

    onProgress(1, `Logging in to ${CONDUCTOR_ACR_NAME}.azurecr.io...`)
    const acr = await sh(`az acr login --name ${CONDUCTOR_ACR_NAME}`, { interactive: true })
    if (acr.code !== 0) {
      throw new Error(
        `Failed to authenticate Docker with ${CONDUCTOR_ACR_NAME}.azurecr.io. Ask IT for pull access to the registry.`
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
