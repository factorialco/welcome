import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import path from 'node:path'
import { getShellArgs } from '../platform.js'
import { shellEscape } from './helpers.js'
import type { AgenticCli, SetupConfig } from '../context/types.js'

// Wording is a contract: factorial-teach's intake keys off "new-hire" context in the invocation.
const HANDOFF_CONTEXT =
  'New-hire onboarding handoff: this session was launched automatically by the ' +
  'welcome script, which just finished setting up my development environment ' +
  'successfully. I am a new hire starting my codebase onboarding.'

export function onboardingCommand(cli: AgenticCli): string {
  switch (cli) {
    case 'claude':
      return `claude ${shellEscape(`/factorial-teach ${HANDOFF_CONTEXT}`)}`
    case 'opencode':
      return `opencode --prompt ${shellEscape(`Use the factorial-teach skill. ${HANDOFF_CONTEXT}`)}`
    case 'codex':
      return `codex ${shellEscape(`Use the factorial-teach skill. ${HANDOFF_CONTEXT}`)}`
  }
}

let deferredConfig: SetupConfig | null = null

export function deferOnboardingLaunch(config: SetupConfig): void {
  deferredConfig = config
}

export function launchDeferredOnboarding(): void {
  if (!deferredConfig) return
  const cli = deferredConfig.agenticClis[0]
  if (!cli) return

  const repoDir = path.join(homedir(), 'code', 'factorial')
  const command = onboardingCommand(cli)
  const [shell, shellFlags] = getShellArgs()

  console.log('\nStarting your codebase onboarding...\n')
  const result = spawnSync(shell, [...shellFlags, command], {
    cwd: repoDir,
    stdio: 'inherit',
  })

  if (result.status === 127 || result.error) {
    console.log(`\nCould not start ${cli} automatically. Start it yourself with:`)
    console.log(`\n  cd ~/code/factorial && ${command}\n`)
  }
}
