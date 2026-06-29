import { type SetupConfig } from '../../context/index.js'
import { CODE_DIR, ORG_NAME, REPO_NAME, REPO_PATH } from '../constants.js'
import {
  dirExists,
  fileExists,
  getErrorMessage,
  sh,
  type ProgressCallback,
  type TaskResult,
} from '../helpers.js'
import { checkGitHubConnectivity } from '../ssh.js'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Step 4: Clone Factorial repository */
export async function runStep4(
  config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    await mkdir(CODE_DIR, { recursive: true })

    // 0. Verify SSH connectivity before any git-over-SSH operation
    onProgress(0, 'Verifying SSH access to GitHub...')
    const sshOk = await checkGitHubConnectivity()
    if (!sshOk) {
      throw new Error(
        'SSH authentication to GitHub failed. Ensure your SSH key is loaded in the agent (ssh-add) and has access to factorialco/factorial.'
      )
    }

    // 1. Clone or pull
    if (!(await dirExists(REPO_PATH))) {
      onProgress(
        1,
        `Cloning factorialco/factorial into ${REPO_PATH}... (this may take a while, patience!)`
      )
      // Blobless partial clone + retry with backoff for flaky networks
      const maxAttempts = 3
      let cloned = false
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const result = await sh(
          `git clone --filter=blob:none git@github.com:${ORG_NAME}/${REPO_NAME}.git "${REPO_PATH}"`,
          { interactive: true }
        )
        if (result.code === 0) {
          cloned = true
          break
        }
        // Clean the partial clone so the retry doesn't hit "already exists"
        await sh(`rm -rf "${REPO_PATH}"`)
        if (attempt < maxAttempts) {
          onProgress(1, `Clone failed (attempt ${attempt}/${maxAttempts}), retrying...`)
          await new Promise((r) => setTimeout(r, attempt * 5000))
        }
      }
      if (!cloned) {
        throw new Error(`Failed to clone Factorial repository after ${maxAttempts} attempts`)
      }
    } else if (await dirExists(path.join(REPO_PATH, '.git'))) {
      onProgress(1, 'Repository already cloned, pulling latest...')
      await sh('git pull', { cwd: REPO_PATH })
    }

    // 2. Git perf settings
    onProgress(2, 'Configuring git fsmonitor...')
    await sh(`git -C "${REPO_PATH}" config core.filemode false`)
    await sh(`git -C "${REPO_PATH}" config core.untrackedCache true`)

    onProgress(3, 'Configuring git untrackedCache...')
    await sh(`git -C "${REPO_PATH}" config core.fsmonitor true`)

    // 3. direnv allow
    onProgress(4, 'Running direnv allow...')
    await sh('find . -maxdepth 2 -name .envrc -execdir direnv allow \\;', {
      cwd: REPO_PATH,
    })

    // 4. Branch-specific DB hook (optional)
    if (config.branchSpecificDb) {
      const hookPath = path.join(REPO_PATH, '.git', 'hooks', 'post-checkout')
      if (!(await fileExists(hookPath))) {
        const hookContent =
          '#!/bin/bash\n[ -x "backend/bin/post-checkout-hook" ] && backend/bin/post-checkout-hook "$@"\nexit 0\n'
        await writeFile(hookPath, hookContent, { mode: 0o755 })
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
