import React from 'react'
import { Box, Text } from 'ink'

export function Footer({ showBack = true }: { showBack?: boolean }) {
  return (
    <Box paddingX={1} justifyContent="space-between" marginTop={0}>
      <Box gap={2}>
        {showBack && (
          <Text dimColor>
            <Text color="gray">esc</Text> back
          </Text>
        )}
      </Box>
      <Text dimColor>
        <Text color="gray">ctrl+c</Text> quit
      </Text>
    </Box>
  )
}
