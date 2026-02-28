import React from 'react'
import { Box, Text } from 'ink'
import { BRAND_COLOR } from '../context.js'

export function Field({
  label,
  value,
  color = 'green',
  dimValue = false
}: {
  label: string
  value: string
  color?: string
  dimValue?: boolean
}) {
  return (
    <Text>
      <Text color={color} bold>
        {label.padEnd(20)}
      </Text>
      <Text dimColor={dimValue}>{value}</Text>
    </Text>
  )
}

export function Divider({ color = 'gray' }: { color?: string }) {
  return (
    <Box>
      <Text color={color} dimColor>
        {'─'.repeat(60)}
      </Text>
    </Box>
  )
}

export function SuccessCheck({ text }: { text: string }) {
  return (
    <Text>
      <Text color="green" bold>
        {'✓ '}
      </Text>
      <Text>{text}</Text>
    </Text>
  )
}

export function PendingDot({ text }: { text: string }) {
  return (
    <Text>
      <Text color="gray">{'○ '}</Text>
      <Text dimColor>{text}</Text>
    </Text>
  )
}

export function ErrorX({ text }: { text: string }) {
  return (
    <Text>
      <Text color="red" bold>
        {'✗ '}
      </Text>
      <Text color="red">{text}</Text>
    </Text>
  )
}

export function ProgressBar({
  percent,
  width = 30,
  color = BRAND_COLOR,
  label
}: {
  percent: number
  width?: number
  color?: string
  label?: string
}) {
  const filled = Math.round((percent / 100) * width)
  const empty = width - filled
  return (
    <Box gap={1}>
      {label && (
        <Box width={20}>
          <Text>{label}</Text>
        </Box>
      )}
      <Text color={color}>
        {'█'.repeat(filled)}
        <Text dimColor>{'░'.repeat(empty)}</Text>
      </Text>
      <Text color={color} bold>
        {' '}
        {percent.toFixed(0)}%
      </Text>
    </Box>
  )
}
