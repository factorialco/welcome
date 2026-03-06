import React, { useState, useEffect, useRef } from 'react'
import { Box, Text } from 'ink'
import { WIZARD_STEPS, BRAND_COLOR, useWizard } from '../context.js'

const HEADER_MESSAGES = [
  'Developer Onboarding',
  'Welcome to the team!',
  "Let's get you set up",
  'Happy coding ahead! ',
]

// Longest message length — used to reserve fixed width so the box doesn't jump
const MAX_MSG_LEN = Math.max(...HEADER_MESSAGES.map((m) => m.length))

type Phase = 'typing' | 'visible' | 'replacing'

function useTypewriter() {
  const [msgIndex, setMsgIndex] = useState(0)
  const [charCount, setCharCount] = useState(0)
  const [phase, setPhase] = useState<Phase>('typing')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const msg = HEADER_MESSAGES[msgIndex]

    switch (phase) {
      case 'typing':
        if (charCount < msg.length) {
          timerRef.current = setTimeout(() => setCharCount((c) => c + 1), 50)
        } else {
          // Fully typed — transition to visible (timeout scheduled there)
          setPhase('visible')
        }
        break

      case 'visible':
        // Full message on screen — pause then start replacing with next
        timerRef.current = setTimeout(() => {
          setCharCount(0)
          setPhase('replacing')
        }, 2500)
        break

      case 'replacing': {
        const nextIndex = (msgIndex + 1) % HEADER_MESSAGES.length
        const nextMsg = HEADER_MESSAGES[nextIndex]
        if (charCount < nextMsg.length) {
          // Overwrite character by character from left to right
          timerRef.current = setTimeout(() => setCharCount((c) => c + 1), 50)
        } else {
          // Replacement complete — advance and show
          setMsgIndex(nextIndex)
          setPhase('visible')
        }
        break
      }
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [charCount, phase, msgIndex])

  const msg = HEADER_MESSAGES[msgIndex]

  if (phase === 'replacing') {
    const nextIndex = (msgIndex + 1) % HEADER_MESSAGES.length
    const nextMsg = HEADER_MESSAGES[nextIndex]
    // Show: new chars typed so far + remaining old chars
    const newPart = nextMsg.slice(0, charCount)
    const oldPart = msg.slice(charCount)
    return newPart + oldPart
  }

  // 'typing' or 'visible': show current message up to charCount
  return phase === 'typing' ? msg.slice(0, charCount) : msg
}

export function Header() {
  const { currentStep, totalSteps } = useWizard()
  const typewriterText = useTypewriter()

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
        <Box width={MAX_MSG_LEN}>
          <Text dimColor>{typewriterText}</Text>
        </Box>
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
