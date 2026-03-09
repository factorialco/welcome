import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { useWizard, BRAND_COLOR } from '../context.js'
import { StepContainer } from '../components/StepContainer.js'

type IdentityField = 'fullName' | 'email'

const FIELDS: { key: IdentityField; label: string; placeholder: string; icon: string }[] = [
  { key: 'fullName', label: 'Full Name', placeholder: 'Jane Doe', icon: '>' },
  { key: 'email', label: 'Email', placeholder: 'jane@factorial.co', icon: '>' }
]

export function IdentityStep() {
  const { config, updateConfig, goNext, goBack, returnToStep, completeReturn } = useWizard()
  const [activeField, setActiveField] = useState(0)
  const [error, setError] = useState('')

  useInput((_input, key) => {
    if (key.escape) {
      if (activeField > 0) {
        setActiveField((f) => f - 1)
      } else if (returnToStep !== null) {
        completeReturn()
      } else {
        goBack()
      }
    }
  })

  const handleSubmit = (value: string) => {
    const field = FIELDS[activeField]
    if (!field) return

    const trimmed = value.trim()
    if (field.key === 'fullName' && trimmed.length === 0) {
      setError('Name cannot be empty')
      return
    }
    if (field.key === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
      setError('Please enter a valid email address')
      return
    }

    setError('')
    updateConfig({ [field.key]: trimmed })
    if (activeField < FIELDS.length - 1) {
      setActiveField((f) => f + 1)
    } else if (returnToStep !== null) {
      completeReturn()
    } else {
      goNext()
    }
  }

  return (
    <StepContainer
      title="Configure Git Identity"
      subtitle="We'll use this to configure git and generate your SSH keys."
    >
      <Box flexDirection="column" gap={1}>
        {FIELDS.map((field, i) => {
          const value = config[field.key]
          const isActive = i === activeField
          const isDone = i < activeField

          return (
            <Box key={field.key} flexDirection="column">
              <Box gap={1}>
                <Text color={isDone ? 'green' : isActive ? BRAND_COLOR : 'gray'} bold={isActive}>
                  {isDone ? '  ✓' : isActive ? '  >' : '   '}{' '}
                </Text>
                <Text color={isActive ? 'white' : 'gray'} bold={isActive}>
                  {field.icon} {field.label}
                </Text>
              </Box>

              {isActive && (
                <Box marginLeft={4} flexDirection="column">
                  <Box>
                    <Text color={BRAND_COLOR}>{'  > '}</Text>
                    <TextInput
                      value={value}
                      onChange={(v) => {
                        setError('')
                        updateConfig({ [field.key]: v })
                      }}
                      onSubmit={handleSubmit}
                      placeholder={field.placeholder}
                      focus={true}
                    />
                  </Box>
                  {error && (
                    <Text color="red">{'      '}{error}</Text>
                  )}
                </Box>
              )}

              {isDone && (
                <Box marginLeft={4}>
                  <Text dimColor>
                    {'    '}
                    {value}
                  </Text>
                </Box>
              )}
            </Box>
          )
        })}
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={2} paddingY={0}>
        <Box flexDirection="column">
          <Text dimColor>This will be used for:</Text>
          <Text dimColor> - git config --global user.name / user.email</Text>
          <Text dimColor> - SSH key generation (Ed25519)</Text>
          <Text dimColor> - GitHub access verification</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          Press <Text color="gray">Enter</Text> to confirm each field <Text color="gray">Esc</Text>{' '}
          to go back
        </Text>
      </Box>
    </StepContainer>
  )
}
