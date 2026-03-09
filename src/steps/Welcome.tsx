import React, { useState, useEffect, useCallback } from 'react'
import { Box, Text, useInput } from 'ink'
import Spinner from 'ink-spinner'
import { useWizard, SETUP_TASKS, BRAND_COLOR, WIZARD_STEPS, loadSavedConfig, clearSavedConfig } from '../context.js'
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

type ResumeState = 'checking' | 'prompt' | 'dismissed'

export function WelcomeStep() {
  const { goNext, restoreSession } = useWizard()
  const [results, setResults] = useState<PreflightResult[]>([])
  const [done, setDone] = useState(false)
  const [hasBlocker, setHasBlocker] = useState(false)

  // Resume state
  const [resumeState, setResumeState] = useState<ResumeState>('checking')
  const [savedSession] = useState(() => loadSavedConfig())

  useEffect(() => {
    if (savedSession && savedSession.currentStep > 0) {
      setResumeState('prompt')
    } else {
      setResumeState('dismissed')
    }
  }, [savedSession])

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
    // Only run checks once resume prompt is resolved
    if (resumeState === 'dismissed') {
      runChecks()
    }
  }, [resumeState, runChecks])

  useInput((input, key) => {
    // Handle resume prompt
    if (resumeState === 'prompt') {
      if (input === 'y' || input === 'Y' || key.return) {
        // Restore session
        if (savedSession) {
          restoreSession(savedSession)
        }
        return
      }
      if (input === 'n' || input === 'N' || key.escape) {
        // Start fresh
        clearSavedConfig()
        setResumeState('dismissed')
        return
      }
      return
    }

    // Handle pre-flight results
    if (key.return && done) {
      if (hasBlocker) {
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

      {/* Resume prompt */}
      {resumeState === 'prompt' && savedSession && (
        <Box marginTop={1} flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={2} paddingY={1}>
          <Text color="yellow" bold>Previous session found</Text>
          <Text>
            Saved at: <Text dimColor>{savedSession.savedAt}</Text>
          </Text>
          <Text>
            Step: <Text bold color={BRAND_COLOR}>{WIZARD_STEPS[savedSession.currentStep] ?? `#${savedSession.currentStep}`}</Text>
          </Text>
          {savedSession.config.fullName && (
            <Text>
              Name: <Text dimColor>{savedSession.config.fullName}</Text>
            </Text>
          )}
          <Box marginTop={1}>
            <Text>
              Resume? <Text color={BRAND_COLOR} bold>Y</Text>
              <Text dimColor>/</Text>
              <Text>n</Text>
            </Text>
          </Box>
        </Box>
      )}

      {/* 13 steps in 2 columns (only show when not prompting resume) */}
      {resumeState === 'dismissed' && (
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
      )}

      {/* Pre-flight checks */}
      {resumeState === 'dismissed' && (
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
      )}

      {/* Action prompt */}
      {resumeState === 'dismissed' && (
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
      )}
    </Box>
  )
}
