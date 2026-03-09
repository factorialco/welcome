import React, { useState, useEffect, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import Spinner from 'ink-spinner'
import { useWizard, SETUP_TASKS, BRAND_COLOR } from '../context.js'
import { runPreflightChecks, type PreflightResult } from '../commands.js'

// Factorial ASCII logo (simplified block art matching the script's style)
const FACTORIAL_LOGO = [
  '  ███████╗ █████╗  ██████╗████████╗ ██████╗ ██████╗ ██╗ █████╗ ██╗     ',
  '  ██╔════╝██╔══██╗██╔════╝╚══██╔══╝██╔═══██╗██╔══██╗██║██╔══██╗██║     ',
  '  █████╗  ███████║██║        ██║   ██║   ██║██████╔╝██║███████║██║     ',
  '  ██╔══╝  ██╔══██║██║        ██║   ██║   ██║██╔══██╗██║██╔══██║██║     ',
  '  ██║     ██║  ██║╚██████╗   ██║   ╚██████╔╝██║  ██║██║██║  ██║███████╗',
  '  ╚═╝     ╚═╝  ╚═╝ ╚═════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚══════╝'
]

const STATUS_ICON: Record<PreflightResult['status'], { char: string; color: string }> = {
  ok: { char: '✓', color: 'green' },
  warn: { char: '!', color: 'yellow' },
  fail: { char: '✗', color: 'red' }
}

const TOTAL_CHECKS = 4

export function WelcomeStep() {
  const { goNext } = useWizard()
  const [results, setResults] = useState<PreflightResult[]>([])
  const [done, setDone] = useState(false)
  const [hasBlocker, setHasBlocker] = useState(false)

  const runChecks = useCallback(() => {
    setResults([])
    setDone(false)
    setHasBlocker(false)

    runPreflightChecks((result, _index) => {
      setResults((prev) => [...prev, result])
    }).then((allResults) => {
      setDone(true)
      setHasBlocker(allResults.some((r) => r.status === 'fail'))
    })
  }, [])

  useEffect(() => {
    runChecks()
  }, [runChecks])

  useInput((_input, key) => {
    if (key.return && done) {
      if (hasBlocker) {
        // Retry checks
        runChecks()
      } else {
        goNext()
      }
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

      {/* Pre-flight checks */}
      <Box marginTop={1} flexDirection="column" marginLeft={2}>
        {results.map((r, i) => {
          const icon = STATUS_ICON[r.status]
          return (
            <Text key={i}>
              <Text color={icon.color} bold>{icon.char} </Text>
              <Text>{r.name}: </Text>
              <Text dimColor>{r.message}</Text>
            </Text>
          )
        })}
        {!done && results.length < TOTAL_CHECKS && (
          <Text color={BRAND_COLOR}>
            <Spinner type="dots" />{' '}
            <Text> Checking system requirements...</Text>
          </Text>
        )}
      </Box>

      {/* Action prompt */}
      <Box marginTop={1} justifyContent="center">
        {done && !hasBlocker && (
          <Text>
            Press{' '}
            <Text color={BRAND_COLOR} bold>
              Enter
            </Text>{' '}
            to begin setup
          </Text>
        )}
        {done && hasBlocker && (
          <Text color="red">
            Fix the issue above, then press{' '}
            <Text bold>Enter</Text>{' '}
            to retry
          </Text>
        )}
      </Box>
    </Box>
  )
}
