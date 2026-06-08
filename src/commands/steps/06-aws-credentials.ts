import { type SetupConfig } from '../../context/index.js'
import { HOME, LOCAL_AWS_DEFAULT_REGION, LOCAL_AWS_PROFILE, REPO_PATH } from '../constants.js'
import {
  fileExists,
  getErrorMessage,
  sh,
  type ProgressCallback,
  type TaskResult,
} from '../helpers.js'
import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

/** Step 6: Configure AWS credentials (SSO login is handled by the AWSSetup wizard step) */
export async function runStep6(
  _config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    // 1. Copy AWS config from repo (now that it's cloned)
    onProgress(0, 'Copying AWS config...')
    const awsDir = path.join(HOME, '.aws')
    await mkdir(awsDir, { recursive: true })
    const awsConfigSrc = path.join(REPO_PATH, '.local-dev', 'aws.config')
    const awsConfigDst = path.join(awsDir, 'config')

    if (!(await fileExists(awsConfigDst))) {
      if (await fileExists(awsConfigSrc)) {
        await copyFile(awsConfigSrc, awsConfigDst)
      }
    }

    // 2. Verify session is still active (login was done in AWSSetup wizard step)
    onProgress(1, 'Verifying AWS session...')
    const verify = await sh(
      `aws sts --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" get-caller-identity`
    )
    if (verify.code !== 0) {
      // Session may have expired — try re-login
      onProgress(1, 'Session expired, re-authenticating...')
      await sh(
        `aws sso --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" login`,
        { interactive: true }
      )
      const recheck = await sh(
        `aws sts --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" get-caller-identity`
      )
      if (recheck.code !== 0) {
        throw new Error('AWS SSO login failed. Please try again.')
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
