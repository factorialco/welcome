import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import SelectInput from 'ink-select-input'
import {
  useWizard,
  BRAND_COLOR,
  type VersionManager,
  type AgenticCli,
  type EditorChoice,
  agenticCliLabel,
  editorChoiceLabel
} from '../context.js'
import { StepContainer } from '../components/StepContainer.js'

const VM_OPTIONS = [
  { label: 'mise  (recommended — fast, Rust-based)', value: 'mise' as VersionManager },
  { label: 'asdf  (classic — shell-based)', value: 'asdf' as VersionManager }
]

const CLI_OPTIONS: { key: AgenticCli; label: string; hint: string }[] = [
  { key: 'opencode', label: 'OpenCode', hint: 'recommended' },
  { key: 'claude', label: 'Claude Code', hint: 'Anthropic' },
  { key: 'codex', label: 'Codex', hint: 'OpenAI' }
]

const EDITOR_OPTIONS: { key: EditorChoice; label: string; hint: string }[] = [
  { key: 'cursor', label: 'Cursor', hint: 'AI-native, VS Code fork' },
  { key: 'vscode', label: 'VS Code', hint: 'classic' }
]

type Phase = 'version-manager' | 'agentic-clis' | 'editors'

export function ToolsStep() {
  const { config, updateConfig, goNext, goBack } = useWizard()
  const [phase, setPhase] = useState<Phase>('version-manager')
  const [cliCursor, setCliCursor] = useState(0)
  const [editorCursor, setEditorCursor] = useState(0)

  useInput((input, key) => {
    if (key.escape) {
      if (phase === 'editors') {
        setPhase('agentic-clis')
      } else if (phase === 'agentic-clis') {
        setPhase('version-manager')
      } else {
        goBack()
      }
      return
    }

    if (phase === 'agentic-clis') {
      if (key.upArrow || input === 'k') {
        setCliCursor((c) => Math.max(c - 1, 0))
      }
      if (key.downArrow || input === 'j') {
        setCliCursor((c) => Math.min(c + 1, CLI_OPTIONS.length - 1))
      }
      if (input === ' ') {
        const cli = CLI_OPTIONS[cliCursor]!.key
        const current = config.agenticClis
        if (current.includes(cli)) {
          updateConfig({ agenticClis: current.filter((c) => c !== cli) })
        } else {
          updateConfig({ agenticClis: [...current, cli] })
        }
      }
      if (key.return) {
        setPhase('editors')
      }
    }

    if (phase === 'editors') {
      if (key.upArrow || input === 'k') {
        setEditorCursor((c) => Math.max(c - 1, 0))
      }
      if (key.downArrow || input === 'j') {
        setEditorCursor((c) => Math.min(c + 1, EDITOR_OPTIONS.length - 1))
      }
      if (input === ' ') {
        const editor = EDITOR_OPTIONS[editorCursor]!.key
        const current = config.editors
        if (current.includes(editor)) {
          updateConfig({ editors: current.filter((e) => e !== editor) })
        } else {
          updateConfig({ editors: [...current, editor] })
        }
      }
      if (key.return) {
        goNext()
      }
    }
  })

  const handleVMSelect = (item: { value: VersionManager }) => {
    updateConfig({ versionManager: item.value })
    setPhase('agentic-clis')
  }

  const CompletedItem = ({ label, value }: { label: string; value: string }) => (
    <Text>
      <Text color="green" bold>
        {'✓ '}
      </Text>
      <Text>{label}: </Text>
      <Text bold color={BRAND_COLOR}>
        {value}
      </Text>
    </Text>
  )

  return (
    <StepContainer
      title="🔌  Development Tools"
      subtitle="Choose your version manager, agentic CLIs, and code editors."
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

      {/* Agentic CLIs */}
      {phase === 'agentic-clis' && (
        <Box flexDirection="column" gap={1}>
          <CompletedItem label="Version manager" value={config.versionManager} />

          <Text color={BRAND_COLOR} bold>
            Which agentic CLIs would you like to install?
          </Text>
          <Text dimColor>AI-powered coding assistants for your terminal.</Text>

          <Box marginLeft={2} flexDirection="column">
            {CLI_OPTIONS.map((opt, i) => (
              <Box key={opt.key} gap={1}>
                <Text color={cliCursor === i ? BRAND_COLOR : 'white'} bold={cliCursor === i}>
                  {cliCursor === i ? '>' : ' '}
                </Text>
                <Text color={config.agenticClis.includes(opt.key) ? 'green' : 'gray'}>
                  {config.agenticClis.includes(opt.key) ? '[x]' : '[ ]'}
                </Text>
                <Text color={cliCursor === i ? 'white' : 'gray'} bold={cliCursor === i}>
                  {opt.label}
                </Text>
                <Text dimColor>({opt.hint})</Text>
              </Box>
            ))}
          </Box>

          <Text dimColor>
            <Text color="gray">j/k</Text> navigate <Text color="gray">Space</Text> toggle{' '}
            <Text color="gray">Enter</Text> continue
          </Text>
        </Box>
      )}

      {/* Editors */}
      {phase === 'editors' && (
        <Box flexDirection="column" gap={1}>
          <CompletedItem label="Version manager" value={config.versionManager} />
          <CompletedItem
            label="Agentic CLIs"
            value={
              config.agenticClis.length > 0
                ? config.agenticClis.map(agenticCliLabel).join(', ')
                : 'None'
            }
          />

          <Text color={BRAND_COLOR} bold>
            Which code editors would you like to install?
          </Text>
          <Text dimColor>We'll install recommended extensions for each selected editor.</Text>

          <Box marginLeft={2} flexDirection="column">
            {EDITOR_OPTIONS.map((opt, i) => (
              <Box key={opt.key} gap={1}>
                <Text color={editorCursor === i ? BRAND_COLOR : 'white'} bold={editorCursor === i}>
                  {editorCursor === i ? '>' : ' '}
                </Text>
                <Text color={config.editors.includes(opt.key) ? 'green' : 'gray'}>
                  {config.editors.includes(opt.key) ? '[x]' : '[ ]'}
                </Text>
                <Text color={editorCursor === i ? 'white' : 'gray'} bold={editorCursor === i}>
                  {opt.label}
                </Text>
                <Text dimColor>({opt.hint})</Text>
              </Box>
            ))}
          </Box>

          <Text dimColor>
            <Text color="gray">j/k</Text> navigate <Text color="gray">Space</Text> toggle{' '}
            <Text color="gray">Enter</Text> continue
          </Text>
        </Box>
      )}
    </StepContainer>
  )
}
