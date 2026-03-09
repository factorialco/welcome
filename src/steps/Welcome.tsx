import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import Spinner from 'ink-spinner'
import { useWizard, SETUP_TASKS, BRAND_COLOR } from '../context.js'

// Factorial ASCII logo (simplified block art matching the script's style)
const FACTORIAL_LOGO = [
  '  ███████╗ █████╗  ██████╗████████╗ ██████╗ ██████╗ ██╗ █████╗ ██╗     ',
  '  ██╔════╝██╔══██╗██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗██║██╔══██╗██║     ',
  '  █████╗  ███████║██║        ██║   ██║   ██║██████╔╝██║███████║██║     ',
  '  ██╔══╝  ██╔══██║██║        ██║   ██║   ██║██╔══██╗██║██╔══██║██║     ',
  '  ██║     ██║  ██║╚██████╗   ██║   ╚██████╔╝██║  ██║██║██║  ██║███████╗',
  '  ╚═╝     ╚═╝  ╚═╝ ╚═════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚══════╝'
]

export function WelcomeStep() {
  const { goNext } = useWizard()
  const [showContinue, setShowContinue] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setShowContinue(true), 1200)
    return () => clearTimeout(timer)
  }, [])

  useInput((_input, key) => {
    if (key.return && showContinue) {
      goNext()
    }
  })

  return (
    <Box
      flexDirection="column"
      paddingX={2}
      paddingY={1}
      borderStyle="round"
      borderColor={BRAND_COLOR}
      minHeight={14}
    >
      {/* ASCII Logo */}
      <Box justifyContent="center" flexDirection="column" alignItems="center">
        {FACTORIAL_LOGO.map((line, i) => (
          <Text key={i} color={BRAND_COLOR} bold>
            {line}
          </Text>
        ))}
      </Box>

      <Box justifyContent="center" marginTop={1} marginBottom={1}>
        <Text bold color={BRAND_COLOR}>
          {'─── '}Developer Onboarding Wizard{' ───'}
        </Text>
      </Box>

      <Box justifyContent="center" flexDirection="column" alignItems="center" gap={0}>
        <Text dimColor>This wizard will set up your complete local development</Text>
        <Text dimColor>environment for working on the Factorial platform.</Text>
      </Box>

      {/* 13 steps in 2 columns */}
      <Box marginTop={1} justifyContent="center" gap={4}>
        <Box flexDirection="column">
          {SETUP_TASKS.slice(0, 7).map((task) => (
            <Text key={task.id}>
              <Text color={BRAND_COLOR}>{task.icon} </Text>
              <Text dimColor>
                {String(task.id).padStart(2, ' ')}. {task.name}
              </Text>
            </Text>
          ))}
        </Box>
        <Box flexDirection="column">
          {SETUP_TASKS.slice(7).map((task) => (
            <Text key={task.id}>
              <Text color={BRAND_COLOR}>{task.icon} </Text>
              <Text dimColor>
                {String(task.id).padStart(2, ' ')}. {task.name}
              </Text>
            </Text>
          ))}
        </Box>
      </Box>

      <Box marginTop={1} justifyContent="center">
        {showContinue ? (
          <Text>
            Press{' '}
            <Text color={BRAND_COLOR} bold>
              Enter
            </Text>{' '}
            to begin setup
          </Text>
        ) : (
          <Text color={BRAND_COLOR}>
            <Spinner type="dots" /> <Text> Initializing...</Text>
          </Text>
        )}
      </Box>
    </Box>
  )
}
