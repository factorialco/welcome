import React from 'react'
import { Box, Text, useInput } from 'ink'
import { useWizard, SETUP_TASKS, BRAND_COLOR, agenticCliLabel, editorChoiceLabel } from '../context.js'
import { StepContainer } from '../components/StepContainer.js'
import { Field, Divider } from '../components/UI.js'

export function ReviewStep() {
  const { config, goNext, goBack, goToStep } = useWizard()

  useInput((input, key) => {
    if (key.escape) {
      goBack()
    }
    if (key.return) {
      goNext()
    }
    // Jump to config steps: 1=Identity, 2=Tools, 3=Services
    const num = parseInt(input)
    if (num >= 1 && num <= 3) {
      goToStep(num)
    }
  })

  return (
    <StepContainer
      title="📋  Review Configuration"
      subtitle="Review your settings before we begin the installation."
    >
      <Box gap={4}>
        {/* Left column */}
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text color={BRAND_COLOR} bold underline>
              1. Git Identity
            </Text>
            <Field
              label="Name"
              value={config.fullName || '(not set)'}
              dimValue={!config.fullName}
              color={BRAND_COLOR}
            />
            <Field
              label="Email"
              value={config.email || '(not set)'}
              dimValue={!config.email}
              color={BRAND_COLOR}
            />
          </Box>

          <Box flexDirection="column">
            <Text color={BRAND_COLOR} bold underline>
              2. Development Tools
            </Text>
            <Field label="Version Manager" value={config.versionManager} color={BRAND_COLOR} />
            <Field
              label="Agentic CLIs"
              value={
                config.agenticClis.length > 0
                  ? config.agenticClis.map(agenticCliLabel).join(', ')
                  : 'None'
              }
              dimValue={config.agenticClis.length === 0}
              color={BRAND_COLOR}
            />
            <Field
              label="Editors"
              value={
                config.editors.length > 0
                  ? config.editors.map(editorChoiceLabel).join(', ')
                  : 'None'
              }
              dimValue={config.editors.length === 0}
              color={BRAND_COLOR}
            />
          </Box>
        </Box>

        {/* Right column */}
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            <Text color={BRAND_COLOR} bold underline>
              3. Services
            </Text>
            <Field label="Ngrok" value={config.setupNgrok ? 'Yes' : 'No'} color={BRAND_COLOR} />
            {config.setupNgrok && (
              <>
                <Field
                  label="  Domain"
                  value={config.ngrokDomain || '(default)'}
                  dimValue={!config.ngrokDomain}
                  color={BRAND_COLOR}
                />
                <Field
                  label="  Authtoken"
                  value={config.ngrokAuthtoken ? '••••••••' : '(will prompt)'}
                  dimValue={!config.ngrokAuthtoken}
                  color={BRAND_COLOR}
                />
              </>
            )}
            <Field label="Cognito" value={config.setupCognito ? 'Yes' : 'No'} color={BRAND_COLOR} />
            <Field label="Restore DB" value={config.restoreDb ? 'Yes' : 'No'} color={BRAND_COLOR} />
            <Field
              label="Branch DBs"
              value={config.branchSpecificDb ? 'Yes' : 'No'}
              color={BRAND_COLOR}
            />
          </Box>
        </Box>
      </Box>

      <Divider />

      {/* Tasks summary */}
      <Box flexDirection="column" marginTop={0}>
        <Text bold>Tasks to execute ({SETUP_TASKS.length}):</Text>
        <Box gap={4} marginTop={0}>
          <Box flexDirection="column">
            {SETUP_TASKS.slice(0, 7).map((task) => {
              const skipped =
                (task.id === 10 && !config.setupNgrok) || (task.id === 11 && !config.setupCognito)
              return (
                <Text key={task.id} dimColor={skipped} strikethrough={skipped}>
                  <Text color={skipped ? 'gray' : 'green'}>{skipped ? '○' : '●'} </Text>
                  {task.icon} {task.name}
                </Text>
              )
            })}
          </Box>
          <Box flexDirection="column">
            {SETUP_TASKS.slice(7).map((task) => {
              const skipped =
                (task.id === 10 && !config.setupNgrok) || (task.id === 11 && !config.setupCognito)
              return (
                <Text key={task.id} dimColor={skipped} strikethrough={skipped}>
                  <Text color={skipped ? 'gray' : 'green'}>{skipped ? '○' : '●'} </Text>
                  {task.icon} {task.name}
                </Text>
              )
            })}
          </Box>
        </Box>
      </Box>

      <Divider />

      <Box gap={2} justifyContent="center">
        <Text>
          Press{' '}
          <Text color={BRAND_COLOR} bold>
            Enter
          </Text>{' '}
          to start installation
        </Text>
        <Text dimColor>|</Text>
        <Text dimColor>
          <Text color="gray">1-3</Text> edit section
        </Text>
        <Text dimColor>|</Text>
        <Text dimColor>
          <Text color="gray">Esc</Text> back
        </Text>
      </Box>
    </StepContainer>
  )
}
