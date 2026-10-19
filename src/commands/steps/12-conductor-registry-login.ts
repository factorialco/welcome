import { type SetupConfig } from '../../context/index.js'
import { CONDUCTOR_REGISTRY } from '../constants.js'
import { getErrorMessage, sh, type ProgressCallback, type TaskResult } from '../helpers.js'

/** Step 12: Conductor registry login — authenticate Docker with GHCR through
 *  the GitHub CLI so the conductor images can be pulled (runs before step 13). */
export async function runStep12(
  _config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    onProgress(0, 'Logging in to GitHub...')
    const status = await sh('gh auth status --hostname github.com 2>&1')
    if (status.code !== 0) {
      const login = await sh(
        'gh auth login --hostname github.com --git-protocol ssh --web --scopes read:packages',
        { interactive: true }
      )
      if (login.code !== 0) {
        throw new Error('GitHub login failed. Run `gh auth login` and retry.')
      }
    } else if (!status.stdout.includes('read:packages')) {
      // gh's default login cannot read packages; adding the scope opens the browser once.
      const refresh = await sh('gh auth refresh --hostname github.com --scopes read:packages', {
        interactive: true,
      })
      if (refresh.code !== 0) {
        throw new Error(
          'Could not add the read:packages scope. Run `gh auth refresh --scopes read:packages`.'
        )
      }
    }

    onProgress(1, `Logging in to ${CONDUCTOR_REGISTRY}...`)
    const login = await sh(
      `gh auth token | docker login ${CONDUCTOR_REGISTRY} --username "$(gh api user --jq .login)" --password-stdin`
    )
    if (login.code !== 0) {
      throw new Error(`Failed to authenticate Docker with ${CONDUCTOR_REGISTRY}.`)
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
