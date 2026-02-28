import React from 'react'
import { Box, Text } from 'ink'
import { WIZARD_STEPS, BRAND_COLOR, useWizard } from '../context.js'

export function Header() {
  const { currentStep, totalSteps } = useWizard()

  return (
    <Box flexDirection="column">
      {/* Logo bar */}
      <Box
        borderStyle="round"
        borderColor={BRAND_COLOR}
        paddingX={1}
        justifyContent="space-between"
      >
        <Text color={BRAND_COLOR} bold>
          {' '}
          factorial{' '}
        </Text>
        <Text dimColor>Developer Onboarding</Text>
      </Box>

      {/* Progress bar — compact for 6 wizard screens */}
      <Box paddingX={1} gap={0} marginTop={0}>
        {WIZARD_STEPS.map((label, i) => {
          const isActive = i === currentStep
          const isDone = i < currentStep
          const color = isDone ? 'green' : isActive ? BRAND_COLOR : 'gray'
          const icon = isDone ? '●' : isActive ? '◉' : '○'

          return (
            <Box key={label} gap={0}>
              <Text color={color} bold={isActive}>
                {icon}
              </Text>
              {isActive && (
                <Text color={color} bold>
                  {' '}
                  {label}
                </Text>
              )}
              {i < WIZARD_STEPS.length - 1 && (
                <Text color={isDone ? 'green' : 'gray'} dimColor={!isDone}>
                  {'───'}
                </Text>
              )}
            </Box>
          )
        })}
        <Box flexGrow={1} />
        <Text dimColor>
          {currentStep + 1}/{totalSteps}
        </Text>
      </Box>
    </Box>
  )
}
