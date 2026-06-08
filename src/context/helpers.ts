import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import type { SetupConfig, SavedState, AgenticCli, EditorChoice } from './types.js'

// ── Label helpers ──────────────────────────────────────
export function agenticCliLabel(cli: AgenticCli): string {
  switch (cli) {
    case 'opencode':
      return 'OpenCode'
    case 'claude':
      return 'Claude Code'
    case 'codex':
      return 'Codex'
  }
}

export function editorChoiceLabel(editor: EditorChoice): string {
  switch (editor) {
    case 'cursor':
      return 'Cursor'
    case 'vscode':
      return 'VS Code'
  }
}

// ── Config persistence ─────────────────────────────────
const CONFIG_DIR = path.join(homedir(), '.factorial')
const CONFIG_FILE = path.join(CONFIG_DIR, 'welcome-config.json')

/** Load previously saved wizard state, or null if none exists */
export function loadSavedConfig(): SavedState | null {
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8')
    const parsed = JSON.parse(raw) as SavedState
    // Basic validation: must have config and currentStep
    if (parsed && typeof parsed.currentStep === 'number' && parsed.config) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

/** Save wizard state to disk */
export function saveConfigToDisk(config: SetupConfig, currentStep: number): void {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true })
    const state: SavedState = {
      config,
      currentStep,
      savedAt: new Date().toISOString(),
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(state, null, 2) + '\n')
  } catch {
    // Non-fatal: silently ignore write errors
  }
}

/** Delete saved wizard state */
export function clearSavedConfig(): void {
  try {
    unlinkSync(CONFIG_FILE)
  } catch {
    // File may not exist — that's fine
  }
}

// ── System identity ────────────────────────────────────
export function getIdentityFromSystem(): { fullName: string; email: string } {
  try {
    const username = execSync('whoami', { encoding: 'utf-8' }).trim()
    const fullName = username
      .split('.')
      .map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
    const email = `${username}@factorial.co`
    return { fullName, email }
  } catch {
    return { fullName: '', email: '' }
  }
}
