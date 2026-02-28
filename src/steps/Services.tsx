import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import SelectInput from 'ink-select-input'
import { useWizard, BRAND_COLOR } from '../context.js'
import { StepContainer } from '../components/StepContainer.js'

type Phase = 'ngrok' | 'ngrok-domain' | 'ngrok-token' | 'cognito' | 'db-options'

const YES_NO = [
  { label: 'Yes (recommended)', value: 'yes' },
  { label: 'No', value: 'no' }
]

const NO_YES = [
  { label: 'No (default)', value: 'no' },
  { label: 'Yes', value: 'yes' }
]

export function ServicesStep() {
  const { config, updateConfig, goNext, goBack } = useWizard()
  const [phase, setPhase] = useState<Phase>('ngrok')
  const [dbCursor, setDbCursor] = useState(0)

  useInput((input, key) => {
    if (key.escape) {
      if (phase === 'db-options') {
        setPhase('cognito')
      } else if (phase === 'cognito' && !config.setupNgrok) {
        setPhase('ngrok')
      } else if (phase === 'cognito') {
        setPhase('ngrok-token')
      } else if (phase === 'ngrok-token') {
        setPhase('ngrok-domain')
      } else if (phase === 'ngrok-domain') {
        setPhase('ngrok')
      } else {
        goBack()
      }
      return
    }

    // DB options phase keyboard handling
    if (phase === 'db-options') {
      if (key.upArrow || input === 'k') {
        setDbCursor(0)
      }
      if (key.downArrow || input === 'j') {
        setDbCursor(1)
      }
      if (input === ' ') {
        if (dbCursor === 0) {
          updateConfig({ restoreDb: !config.restoreDb })
        } else {
          updateConfig({ branchSpecificDb: !config.branchSpecificDb })
        }
      }
      if (key.return) {
        goNext()
      }
    }
  })

  const handleNgrok = (item: { value: string }) => {
    const yes = item.value === 'yes'
    updateConfig({ setupNgrok: yes })
    if (yes) {
      setPhase('ngrok-domain')
    } else {
      setPhase('cognito')
    }
  }

  const handleNgrokDomain = () => {
    setPhase('ngrok-token')
  }

  const handleNgrokToken = () => {
    setPhase('cognito')
  }

  const handleCognito = (item: { value: string }) => {
    updateConfig({ setupCognito: item.value === 'yes' })
    setPhase('db-options')
  }

  const CompletedItem = ({ label, value }: { label: string; value: string }) => (
    <Text>
      <Text color="green" bold>
        {'✓ '}
      </Text>
      <Text>{label}: </Text>
      <Text bold color={BRAND_COLOR}>
        {value}
      </Text>
    </Text>
  )

  return (
    <StepContainer
      title="🌐  Services & Infrastructure"
      subtitle="Configure Ngrok tunneling, Cognito auth, and database options."
    >
      <Box flexDirection="column" gap={1}>
        {/* Show completed items as we progress */}
        {phase !== 'ngrok' && (
          <CompletedItem label="Ngrok" value={config.setupNgrok ? 'Yes' : 'No'} />
        )}
        {config.setupNgrok && !['ngrok', 'ngrok-domain'].includes(phase) && (
          <CompletedItem label="Ngrok domain" value={config.ngrokDomain || '(default)'} />
        )}
        {config.setupNgrok && !['ngrok', 'ngrok-domain', 'ngrok-token'].includes(phase) && (
          <CompletedItem
            label="Ngrok token"
            value={config.ngrokAuthtoken ? '••••••••' : '(will prompt later)'}
          />
        )}
        {phase === 'db-options' && (
          <CompletedItem label="Cognito" value={config.setupCognito ? 'Yes' : 'No'} />
        )}

        {/* Ngrok question */}
        {phase === 'ngrok' && (
          <Box flexDirection="column" gap={1}>
            <Text color={BRAND_COLOR} bold>
              Would you like to configure Ngrok tunneling?
            </Text>
            <Text dimColor>Ngrok provides HTTPS tunnels for local development and webhooks.</Text>
            <Box marginLeft={2}>
              <SelectInput items={YES_NO} onSelect={handleNgrok} />
            </Box>
          </Box>
        )}

        {/* Ngrok domain */}
        {phase === 'ngrok-domain' && (
          <Box flexDirection="column" gap={1}>
            <Text color={BRAND_COLOR} bold>
              Enter your Ngrok domain:
            </Text>
            <Box marginLeft={2} gap={1}>
              <Text color={BRAND_COLOR}>{'> '}</Text>
              <TextInput
                value={config.ngrokDomain}
                onChange={(v) => updateConfig({ ngrokDomain: v })}
                onSubmit={handleNgrokDomain}
                placeholder="my-name.ngrok-free.app"
                focus={true}
              />
            </Box>
          </Box>
        )}

        {/* Ngrok authtoken */}
        {phase === 'ngrok-token' && (
          <Box flexDirection="column" gap={1}>
            <Text color={BRAND_COLOR} bold>
              Enter your Ngrok authtoken:
            </Text>
            <Text dimColor>Find it at https://dashboard.ngrok.com/get-started/your-authtoken</Text>
            <Box marginLeft={2} gap={1}>
              <Text color={BRAND_COLOR}>{'> '}</Text>
              <TextInput
                value={config.ngrokAuthtoken}
                onChange={(v) => updateConfig({ ngrokAuthtoken: v })}
                onSubmit={handleNgrokToken}
                placeholder="2abc123..."
                focus={true}
              />
            </Box>
          </Box>
        )}

        {/* Cognito */}
        {phase === 'cognito' && (
          <Box flexDirection="column" gap={1}>
            <Text color={BRAND_COLOR} bold>
              Would you like to provision Cognito authentication?
            </Text>
            <Text dimColor>Sets up KMS, IAM, Lambda, and a Cognito User Pool.</Text>
            <Text dimColor>Only needed for authentication feature work. Default: No</Text>
            <Box marginLeft={2}>
              <SelectInput items={NO_YES} onSelect={handleCognito} />
            </Box>
          </Box>
        )}

        {/* DB options */}
        {phase === 'db-options' && (
          <Box flexDirection="column" gap={1}>
            <Text color={BRAND_COLOR} bold>
              Database options:
            </Text>

            <Box marginLeft={2} flexDirection="column">
              {[
                {
                  key: 'restoreDb' as const,
                  label: 'Restore database from backup',
                  hint: 'recommended for first setup'
                },
                {
                  key: 'branchSpecificDb' as const,
                  label: 'Branch-specific databases',
                  hint: 'separate DB per git branch'
                }
              ].map((opt, i) => (
                <Box key={opt.key} gap={1}>
                  <Text color={dbCursor === i ? BRAND_COLOR : 'white'} bold={dbCursor === i}>
                    {dbCursor === i ? '>' : ' '}
                  </Text>
                  <Text color={config[opt.key] ? 'green' : 'gray'}>
                    {config[opt.key] ? '[x]' : '[ ]'}
                  </Text>
                  <Text color={dbCursor === i ? 'white' : 'gray'} bold={dbCursor === i}>
                    {opt.label}
                  </Text>
                  <Text dimColor>({opt.hint})</Text>
                </Box>
              ))}
            </Box>

            <Text dimColor>
              <Text color="gray">j/k</Text> navigate <Text color="gray">Space</Text> toggle{' '}
              <Text color="gray">Enter</Text> continue
            </Text>
          </Box>
        )}
      </Box>
    </StepContainer>
  )
}
