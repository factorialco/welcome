import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import Spinner from 'ink-spinner'
import { useWizard, BRAND_COLOR } from '../context.js'
import { StepContainer } from '../components/StepContainer.js'
import { Divider } from '../components/UI.js'
import {
  checkGitHubConnectivity,
  findWorkingSSHKey,
  generateSSHKey,
  copyToClipboard,
  openURL,
  verifySSHAccess,
  configureSSHKey
} from '../commands.js'

type Phase =
  | 'checking'       // Looking for existing working SSH key
  | 'found'          // Found a working key, ready to continue
  | 'generating'     // Generating a new key
  | 'instructions'   // Show public key + instructions to user
  | 'verifying'      // Verifying SSO authorization
  | 'verified'       // Verification passed, ready to continue
  | 'error'          // Something went wrong

export function SSHSetupStep() {
  const { config, updateConfig, goNext, goBack } = useWizard()

  const [phase, setPhase] = useState<Phase>('checking')
  const [keyPath, setKeyPath] = useState<string>('')
  const [publicKey, setPublicKey] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [opened, setOpened] = useState(false)

  // On mount, check for existing SSH key
  useEffect(() => {
    checkExistingKey()
  }, [])

  async function checkExistingKey() {
    setPhase('checking')
    try {
      // First, try plain SSH connectivity — covers users who already have
      // GitHub + SSO configured via their agent, default keys, or ssh config.
      const hasConnectivity = await checkGitHubConnectivity()
      if (hasConnectivity) {
        updateConfig({ sshKeyPath: '__default__' })
        setPhase('found')
        return
      }

      // No default connectivity — scan individual private keys
      const existing = await findWorkingSSHKey()
      if (existing) {
        setKeyPath(existing)
        await configureSSHKey(existing)
        updateConfig({ sshKeyPath: existing })
        setPhase('found')
      } else {
        // No working key found, generate one
        await generateNewKey()
      }
    } catch (e: any) {
      setErrorMsg(e.message)
      setPhase('error')
    }
  }

  async function generateNewKey() {
    setPhase('generating')
    try {
      const email = config.email || 'dev@factorial.co'
      const result = await generateSSHKey(email)
      setKeyPath(result.keyPath)
      setPublicKey(result.publicKey)
      setPhase('instructions')
    } catch (e: any) {
      setErrorMsg(`Failed to generate SSH key: ${e.message}`)
      setPhase('error')
    }
  }

  async function handleCopy() {
    try {
      await copyToClipboard(publicKey)
      setCopied(true)
    } catch {
      // clipboard may not be available, that's ok
    }
  }

  async function handleOpen() {
    try {
      await openURL('https://github.com/settings/keys')
      setOpened(true)
    } catch {
      // browser may not open, that's ok
    }
  }

  async function handleVerify() {
    setPhase('verifying')
    try {
      const ok = await verifySSHAccess(keyPath)
      if (ok) {
        updateConfig({ sshKeyPath: keyPath })
        setPhase('verified')
      } else {
        setErrorMsg('SSH key does not have access to factorialco/factorial. Make sure you added the key to GitHub and authorized the factorialco SSO.')
        setPhase('instructions')
      }
    } catch (e: any) {
      setErrorMsg(`Verification failed: ${e.message}`)
      setPhase('instructions')
    }
  }

  useInput((input, key) => {
    if (phase === 'found' || phase === 'verified') {
      if (key.return) {
        goNext()
      }
    }
    if (phase === 'instructions') {
      if (input === 'c' || input === 'C') {
        handleCopy()
      }
      if (input === 'o' || input === 'O') {
        handleOpen()
      }
      if (input === 'v' || input === 'V') {
        handleVerify()
      }
    }
    if (phase === 'error') {
      if (input === 'r' || input === 'R') {
        setErrorMsg('')
        checkExistingKey()
      }
    }
    if (key.escape) {
      goBack()
    }
  })

  return (
    <StepContainer
      title="🔑  SSH Key Setup"
      subtitle="Configure SSH access to GitHub for the Factorial organization."
    >
      {phase === 'checking' && (
        <Box>
          <Text color={BRAND_COLOR}>
            <Spinner type="dots" />
          </Text>
          <Text> Checking for existing SSH keys with GitHub access...</Text>
        </Box>
      )}

      {phase === 'found' && (
        <Box flexDirection="column" gap={1}>
          <Text>
            <Text color="green" bold>{'✓ '}</Text>
            SSH access to factorialco/factorial is working.
          </Text>
          {keyPath && <Text dimColor>  Key: {keyPath}</Text>}
          <Divider />
          <Text>
            Press{' '}
            <Text color={BRAND_COLOR} bold>Enter</Text>
            {' '}to continue to installation
          </Text>
        </Box>
      )}

      {phase === 'generating' && (
        <Box>
          <Text color={BRAND_COLOR}>
            <Spinner type="dots" />
          </Text>
          <Text> Generating new SSH key for {config.email || 'dev@factorial.co'}...</Text>
        </Box>
      )}

      {phase === 'instructions' && (
        <Box flexDirection="column" gap={1}>
          <Text bold>New SSH key generated. Follow these steps:</Text>

          <Divider />

          <Box flexDirection="column">
            <Text color={BRAND_COLOR} bold>Your public key:</Text>
            <Box
              borderStyle="single"
              borderColor="gray"
              paddingX={1}
              marginTop={0}
            >
              <Text wrap="wrap">{publicKey}</Text>
            </Box>
          </Box>

          <Box flexDirection="column">
            <Text bold>Instructions:</Text>
            <Text>
              {'  '}1. Press <Text color={BRAND_COLOR} bold>c</Text> to copy the public key to clipboard
              {copied && <Text color="green"> (copied!)</Text>}
            </Text>
            <Text>
              {'  '}2. Press <Text color={BRAND_COLOR} bold>o</Text> to open github.com/settings/keys
              {opened && <Text color="green"> (opened!)</Text>}
            </Text>
            <Text>{'  '}3. Click <Text bold>"New SSH key"</Text>, paste the key, and save</Text>
            <Text>{'  '}4. Click <Text bold>"Configure SSO"</Text> next to the key and authorize <Text bold>factorialco</Text></Text>
            <Text>
              {'  '}5. Press <Text color={BRAND_COLOR} bold>v</Text> to verify access
            </Text>
          </Box>

          {errorMsg && (
            <Text color="red">
              <Text bold>{'✗ '}</Text>
              {errorMsg}
            </Text>
          )}

          <Divider />

          <Box gap={2}>
            <Text>
              <Text color={BRAND_COLOR} bold>c</Text> copy key
            </Text>
            <Text dimColor>|</Text>
            <Text>
              <Text color={BRAND_COLOR} bold>o</Text> open GitHub
            </Text>
            <Text dimColor>|</Text>
            <Text>
              <Text color={BRAND_COLOR} bold>v</Text> verify access
            </Text>
            <Text dimColor>|</Text>
            <Text dimColor>
              <Text color="gray">Esc</Text> back
            </Text>
          </Box>
        </Box>
      )}

      {phase === 'verifying' && (
        <Box>
          <Text color={BRAND_COLOR}>
            <Spinner type="dots" />
          </Text>
          <Text> Verifying SSH access to factorialco/factorial...</Text>
        </Box>
      )}

      {phase === 'verified' && (
        <Box flexDirection="column" gap={1}>
          <Text>
            <Text color="green" bold>{'✓ '}</Text>
            SSH key verified! You have access to factorialco/factorial.
          </Text>
          <Text dimColor>  Key: {keyPath}</Text>
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
          <Divider />
          <Box gap={2}>
            <Text>
              Press <Text color={BRAND_COLOR} bold>r</Text> to retry
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
