import React from 'react'
import { Box, Text } from 'ink'
import { BRAND_COLOR } from '../context.js'

export function StepContainer({
  title,
  subtitle,
  children,
  color = BRAND_COLOR
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  color?: string
}) {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={color}
      paddingX={2}
      paddingY={1}
      minHeight={14}
    >
      <Box marginBottom={1} flexDirection="column">
        <Text bold color={BRAND_COLOR}>
          {title}
        </Text>
        {subtitle && (
          <Text dimColor italic>
            {subtitle}
          </Text>
        )}
      </Box>
      {children}
    </Box>
  )
}
