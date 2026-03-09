import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import Spinner from 'ink-spinner'
import { useWizard, SETUP_TASKS, BRAND_COLOR, WIZARD_STEPS, loadSavedConfig, clearSavedConfig } from '../context.js'
import type { PreflightResult } from '../commands.js'

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

type ResumeState = 'checking' | 'prompt' | 'dismissed'

export function WelcomeStep() {
  const { goNext, restoreSession, runPreflight, preflightResults, preflightDone, preflightHasBlocker } = useWizard()

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

  // Trigger pre-flight checks once resume prompt is resolved
  useEffect(() => {
    if (resumeState === 'dismissed') {
      runPreflight()
    }
  }, [resumeState, runPreflight])

  useInput((input, key) => {
    // Handle resume prompt
    if (resumeState === 'prompt') {
      if (input === 'y' || input === 'Y' || key.return) {
        if (savedSession) {
          restoreSession(savedSession)
        }
        return
      }
      if (input === 'n' || input === 'N' || key.escape) {
        clearSavedConfig()
        setResumeState('dismissed')
        return
      }
      return
    }

    // Handle pre-flight results
    if (key.return && preflightDone) {
      if (preflightHasBlocker) {
        runPreflight()
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

      {/* System checks — horizontal row */}
      {resumeState === 'dismissed' && (
        <Box marginTop={1} justifyContent="center" gap={2}>
          <Text dimColor bold>System checks</Text>
          {preflightResults.map((r, i) => {
            const icon = STATUS_ICON[r.status]
            return (
              <Text key={i}>
                <Text color={icon.color}>{icon.char}</Text>
                <Text dimColor={r.status === 'ok'}>{' '}{r.name}</Text>
              </Text>
            )
          })}
          {!preflightDone && (
            <Text color={BRAND_COLOR}>
              <Spinner type="dots" />
            </Text>
          )}
        </Box>
      )}

      {/* Action prompt */}
      {resumeState === 'dismissed' && preflightDone && (
        <Box marginTop={1} justifyContent="center">
          {!preflightHasBlocker && (
            <Text>
              Press{' '}
              <Text color={BRAND_COLOR} bold>
                Enter
              </Text>{' '}
              to begin setup
            </Text>
          )}
          {preflightHasBlocker && (
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
