import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import Spinner from 'ink-spinner'
import { useWizard, BRAND_COLOR } from '../context.js'
import { StepContainer } from '../components/StepContainer.js'
import { Divider } from '../components/UI.js'
import {
  checkAWSCLI,
  installAWSCLI,
  hasAWSConfig,
  ensureAWSProfileConfig,
  checkAWSSession,
  runAWSSSOLogin,
  getAWSCallerIdentity
} from '../commands.js'

type Phase =
  | 'checking'       // Checking AWS CLI and existing session
  | 'installing'     // Installing AWS CLI
  | 'authenticated'  // Already authenticated, ready to continue
  | 'ready'          // Ready to start SSO login
  | 'logging-in'     // SSO login in progress (browser open)
  | 'verified'       // Login verified, ready to continue
  | 'error'          // Something went wrong

export function AWSSetupStep() {
  const { config, updateConfig, goNext, goBack } = useWizard()

  const [phase, setPhase] = useState<Phase>('checking')
  const [identity, setIdentity] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [hasConfig, setHasConfig] = useState(false)

  useEffect(() => {
    checkExistingSession()
  }, [])

  async function checkExistingSession() {
    setPhase('checking')
    try {
      // Check if AWS CLI is available
      const cliInstalled = await checkAWSCLI()
      if (!cliInstalled) {
        // Auto-install AWS CLI
        setPhase('installing')
        const installResult = await installAWSCLI()
        if (!installResult.success) {
          setErrorMsg(installResult.error || 'Failed to install AWS CLI.')
          setPhase('error')
          return
        }
      }

      // Ensure the development profile config exists
      await ensureAWSProfileConfig()

      // Check if config exists
      const configExists = await hasAWSConfig()
      setHasConfig(configExists)

      // Check if session is active
      if (configExists) {
        const sessionActive = await checkAWSSession()
        if (sessionActive) {
          const arn = await getAWSCallerIdentity()
          if (arn) setIdentity(arn)
          updateConfig({ awsAuthenticated: true })
          setPhase('authenticated')
          return
        }
      }

      setPhase('ready')
    } catch (e: any) {
      setErrorMsg(e.message)
      setPhase('error')
    }
  }

  async function handleLogin() {
    setPhase('logging-in')
    setErrorMsg('')
    try {
      const result = await runAWSSSOLogin()
      if (result.success) {
        const arn = await getAWSCallerIdentity()
        if (arn) setIdentity(arn)
        updateConfig({ awsAuthenticated: true })
        setPhase('verified')
      } else {
        setErrorMsg(result.error || 'Login failed.')
        setPhase('ready')
      }
    } catch (e: any) {
      setErrorMsg(`Login failed: ${e.message}`)
      setPhase('ready')
    }
  }

  useInput((input, key) => {
    if (phase === 'authenticated' || phase === 'verified') {
      if (key.return) {
        goNext()
      }
    }
    if (phase === 'ready') {
      if (key.return) {
        handleLogin()
      }
      if (input === 's' || input === 'S') {
        goNext()
      }
    }
    if (phase === 'error') {
      if (input === 'r' || input === 'R') {
        setErrorMsg('')
        checkExistingSession()
      }
      if (input === 's' || input === 'S') {
        goNext()
      }
    }
    if (key.escape) {
      goBack()
    }
  })

  return (
    <StepContainer
      title="AWS Credentials Setup"
      subtitle="Authenticate with AWS SSO for the development profile."
    >
      {phase === 'checking' && (
        <Box>
          <Text color={BRAND_COLOR}>
            <Spinner type="dots" />
          </Text>
          <Text> Checking AWS CLI and existing session...</Text>
        </Box>
      )}

      {phase === 'installing' && (
        <Box>
          <Text color={BRAND_COLOR}>
            <Spinner type="dots" />
          </Text>
          <Text> Installing AWS CLI...</Text>
        </Box>
      )}

      {phase === 'authenticated' && (
        <Box flexDirection="column" gap={1}>
          <Text>
            <Text color="green" bold>{'✓ '}</Text>
            AWS SSO session is active.
          </Text>
          {identity && <Text dimColor>  Identity: {identity}</Text>}
          <Divider />
          <Text>
            Press{' '}
            <Text color={BRAND_COLOR} bold>Enter</Text>
            {' '}to continue to installation
          </Text>
        </Box>
      )}

      {phase === 'ready' && (
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text bold>AWS SSO login is required for the development profile.</Text>
            {!hasConfig && (
              <Text dimColor>
                Note: AWS config will be copied from the repo during installation.
              </Text>
            )}
          </Box>

          <Divider />

          <Box flexDirection="column">
            <Text bold>What will happen:</Text>
            <Text>{'  '}1. A browser window will open with the AWS SSO login page</Text>
            <Text>{'  '}2. Sign in with your Factorial credentials</Text>
            <Text>{'  '}3. Authorize the CLI access</Text>
            <Text>{'  '}4. Return here — verification is automatic</Text>
          </Box>

          {errorMsg && (
            <>
              <Divider />
              <Text color="red">
                <Text bold>{'✗ '}</Text>
                {errorMsg}
              </Text>
            </>
          )}

          <Divider />

          <Box gap={2}>
            <Text>
              Press{' '}
              <Text color={BRAND_COLOR} bold>Enter</Text>
              {' '}to start AWS SSO login
            </Text>
            <Text dimColor>|</Text>
            <Text dimColor>
              <Text color="gray">s</Text> skip
            </Text>
            <Text dimColor>|</Text>
            <Text dimColor>
              <Text color="gray">Esc</Text> back
            </Text>
          </Box>
        </Box>
      )}

      {phase === 'logging-in' && (
        <Box flexDirection="column" gap={1}>
          <Box>
            <Text color={BRAND_COLOR}>
              <Spinner type="dots" />
            </Text>
            <Text> Running AWS SSO login... (check your browser)</Text>
          </Box>
          <Text dimColor>
            Complete the sign-in in your browser, then return here.
          </Text>
          <Text dimColor>
            If the browser didn't open, check <Text color={BRAND_COLOR}>/tmp/welcome.log</Text> for the login URL.
          </Text>
        </Box>
      )}

      {phase === 'verified' && (
        <Box flexDirection="column" gap={1}>
          <Text>
            <Text color="green" bold>{'✓ '}</Text>
            AWS SSO login verified!
          </Text>
          {identity && <Text dimColor>  Identity: {identity}</Text>}
          <Divider />
          <Text>
            Press{' '}
            <Text color={BRAND_COLOR} bold>Enter</Text>
            {' '}to continue to installation
          </Text>
        </Box>
      )}

      {phase === 'error' && (
        <Box flexDirection="column" gap={1}>
          <Text color="red">
            <Text bold>{'✗ '}</Text>
            {errorMsg}
          </Text>
          <Text dimColor>
            If the error persists, ensure you have AWS access or request it
            in <Text bold>"Application Access Request"</Text> in IT Support:
          </Text>
          <Text dimColor>
            https://portal.support.factorialhr.com/servicedesk/customer/portal/247
          </Text>
          <Divider />
          <Box gap={2}>
            <Text>
              Press <Text color={BRAND_COLOR} bold>r</Text> to retry
            </Text>
            <Text dimColor>|</Text>
            <Text dimColor>
              <Text color="gray">s</Text> skip
            </Text>
            <Text dimColor>|</Text>
            <Text dimColor>
              <Text color="gray">Esc</Text> back
            </Text>
          </Box>
        </Box>
      )}
    </StepContainer>
  )
}
