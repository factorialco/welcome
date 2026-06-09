import { Box, Text } from 'ink'
import Spinner from 'ink-spinner'
import { BRAND_COLOR } from '../../context/index.js'
import { StepContainer } from '../../components/StepContainer.js'
import { isDarwin } from '../../platform.js'

/** Shown while waiting for the OS administrator authentication prompt. */
export function SudoGate() {
  const isMac = isDarwin()
  return (
    <StepContainer
      title="Administrator Access Required"
      subtitle="Some tasks need to modify system files (e.g., /etc/hosts)."
    >
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          {isMac ? (
            <Text>A system dialog will appear asking for your password.</Text>
          ) : (
            <Text>Please enter your password below when prompted.</Text>
          )}
        </Box>

        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="yellow"
          paddingX={2}
          paddingY={0}
        >
          <Text color="yellow" bold>
            Important:
          </Text>
          <Text color="yellow">
            You must have enabled <Text bold>"Root permissions"</Text> in the{' '}
            <Text bold>Self Service+</Text> application before continuing.
          </Text>
          <Text color="yellow">
            If you haven't, press <Text bold>Ctrl+C</Text>, enable it, and re-run the setup.
          </Text>
        </Box>

        <Box>
          <Text color={BRAND_COLOR}>
            <Spinner type="dots" />
          </Text>
          <Text> Waiting for administrator authentication...</Text>
        </Box>
      </Box>
    </StepContainer>
  )
}
