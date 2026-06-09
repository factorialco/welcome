import { type SetupConfig } from '../../context/index.js'
import { SKILL_REPOS } from '../constants.js'
import { getErrorMessage, sh, type ProgressCallback, type TaskResult } from '../helpers.js'

/** Step 14: Install agent skills */
export async function runStep14(
  config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    for (let i = 0; i < SKILL_REPOS.length; i++) {
      const repo = SKILL_REPOS[i]!
      onProgress(i, `npx skills add ${repo}...`)
      const result = await sh(`npx --yes skills add "${repo}" -g -y`, {
        interactive: true,
      })
      if (result.code !== 0) {
        // Non-fatal: log but continue
      }
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
