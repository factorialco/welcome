import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import SelectInput from 'ink-select-input'
import { useWizard, BRAND_COLOR, type VersionManager, type Editor } from '../context.js'
import { StepContainer } from '../components/StepContainer.js'

const VM_OPTIONS = [
  { label: 'mise  (recommended — fast, Rust-based)', value: 'mise' as VersionManager },
  { label: 'asdf  (classic — shell-based)', value: 'asdf' as VersionManager }
]

const EDITOR_OPTIONS = [
  { label: 'Agentic CLIs  (recommended — opencode, claude, codex)', value: 'cli' as Editor },
  { label: 'Cursor  (AI-native, VS Code fork)', value: 'cursor' as Editor },
  { label: 'VS Code  (classic)', value: 'vscode' as Editor }
]

type Phase = 'version-manager' | 'editor'

export function ToolsStep() {
  const { config, updateConfig, goNext, goBack } = useWizard()
  const [phase, setPhase] = useState<Phase>('version-manager')

  useInput((_input, key) => {
    if (key.escape) {
      if (phase === 'editor') {
        setPhase('version-manager')
      } else {
        goBack()
      }
    }
  })

  const handleVMSelect = (item: { value: VersionManager }) => {
    updateConfig({ versionManager: item.value })
    setPhase('editor')
  }

  const handleEditorSelect = (item: { value: Editor }) => {
    updateConfig({ editor: item.value })
    goNext()
  }

  return (
    <StepContainer
      title="🔌  Development Tools"
      subtitle="Choose your version manager and code editor."
    >
      {/* Version Manager */}
      {phase === 'version-manager' && (
        <Box flexDirection="column" gap={1}>
          <Text color={BRAND_COLOR} bold>
            Which version manager would you like to use?
          </Text>
          <Text dimColor>This manages Ruby, Node.js, Python, and Rust versions.</Text>
          <Box marginLeft={2}>
            <SelectInput items={VM_OPTIONS} onSelect={handleVMSelect} />
          </Box>

          <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={2} paddingY={0}>
            <Box flexDirection="column">
              <Text dimColor>Plugins to install: rust, ruby, nodejs, python</Text>
              <Text dimColor>Versions will be read from the repo's .tool-versions file</Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* Editor */}
      {phase === 'editor' && (
        <Box flexDirection="column" gap={1}>
          <Text>
            <Text color="green" bold>
              ✓{' '}
            </Text>
            <Text>Version manager: </Text>
            <Text bold color={BRAND_COLOR}>
              {config.versionManager}
            </Text>
          </Text>

          <Text color={BRAND_COLOR} bold>
            Which code editor do you use?
          </Text>
          <Text dimColor>We'll install recommended extensions (23+ extensions).</Text>
          <Box marginLeft={2}>
            <SelectInput items={EDITOR_OPTIONS} onSelect={handleEditorSelect} />
          </Box>
        </Box>
      )}
    </StepContainer>
  )
}
