import { getNativeInstallCommand } from '../platform.js'
import { HOME, LOCAL_AWS_DEFAULT_REGION, LOCAL_AWS_PROFILE } from './constants.js'
import { fileExists, getErrorMessage, sh } from './helpers.js'
import { ensureHomebrew } from './homebrew.js'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Check if AWS CLI is installed */
export async function checkAWSCLI(): Promise<boolean> {
  const result = await sh('aws --version 2>/dev/null')
  return result.code === 0
}

/** Install AWS CLI using the platform package manager */
export async function installAWSCLI(): Promise<{
  success: boolean
  error?: string
}> {
  try {
    // On macOS, ensure Homebrew is installed before attempting brew install
    await ensureHomebrew()
    const installCmd = await getNativeInstallCommand(['awscli'])
    const result = await sh(installCmd, { interactive: true, timeout: 120000 })
    if (result.code !== 0) {
      return {
        success: false,
        error: `Package install failed: ${result.stderr || 'unknown error'}`,
      }
    }
    // Verify it installed
    const verify = await checkAWSCLI()
    return verify
      ? { success: true }
      : {
          success: false,
          error: 'Package installed but aws command not found in PATH.',
        }
  } catch (e) {
    return { success: false, error: getErrorMessage(e) }
  }
}

/** Check if ~/.aws/config exists */
export async function hasAWSConfig(): Promise<boolean> {
  const awsConfigPath = path.join(HOME, '.aws', 'config')
  return fileExists(awsConfigPath)
}

/** Ensure a minimal AWS config with the development profile exists (only if no config file present) */
export async function ensureAWSProfileConfig(): Promise<void> {
  const awsDir = path.join(HOME, '.aws')
  const configPath = path.join(awsDir, 'config')

  // Only write if no config file exists at all
  if (await fileExists(configPath)) {
    return
  }

  const profileConfig = `[profile development]
sso_start_url = https://factorial-main.awsapps.com/start
sso_region = eu-central-1
sso_account_id = 800301453252
sso_role_name = Developer_AWS-Development
region = eu-central-1
output = json
`

  await mkdir(awsDir, { recursive: true })
  await writeFile(configPath, profileConfig)
}

/** Check if an active AWS SSO session exists */
export async function checkAWSSession(): Promise<boolean> {
  const result = await sh(
    `aws sts --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" get-caller-identity 2>/dev/null`
  )
  return result.code === 0
}

/** Run AWS SSO login (interactive — opens browser) */
export async function runAWSSSOLogin(): Promise<{
  success: boolean
  error?: string
}> {
  const result = await sh(
    `aws sso --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" login`,
    { interactive: true }
  )
  if (result.code !== 0) {
    return {
      success: false,
      error:
        'AWS SSO login failed. Please contact support or security teams asking for AWS SSO access.',
    }
  }
  // Verify it worked
  const verify = await sh(
    `aws sts --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" get-caller-identity`
  )
  return verify.code === 0
    ? { success: true }
    : {
        success: false,
        error: 'AWS SSO login completed but verification failed.',
      }
}

/** Get the AWS caller identity (for display) */
export async function getAWSCallerIdentity(): Promise<string | null> {
  const result = await sh(
    `aws sts --profile "${LOCAL_AWS_PROFILE}" --region "${LOCAL_AWS_DEFAULT_REGION}" get-caller-identity --output json 2>/dev/null`
  )
  if (result.code !== 0) return null
  try {
    const identity = JSON.parse(result.stdout)
    return identity.Arn || null
  } catch {
    return null
  }
}
