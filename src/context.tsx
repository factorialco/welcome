import React, { createContext, useContext, useState, type ReactNode } from 'react'
import { execSync } from 'node:child_process'

// ── Brand ──────────────────────────────────────────────
export const BRAND_COLOR = '#ff365f'
export const BRAND_HEX = '#ff365f'

// ── Config types matching welcome.sh user prompts ──────
export type VersionManager = 'mise' | 'asdf'
export type AgenticCli = 'opencode' | 'claude' | 'codex'
export type EditorChoice = 'cursor' | 'vscode'

export function agenticCliLabel(cli: AgenticCli): string {
  switch (cli) {
    case 'opencode': return 'OpenCode'
    case 'claude': return 'Claude Code'
    case 'codex': return 'Codex'
  }
}

export function editorChoiceLabel(editor: EditorChoice): string {
  switch (editor) {
    case 'cursor': return 'Cursor'
    case 'vscode': return 'VS Code'
  }
}

export type SetupConfig = {
  // Git identity (step 3)
  fullName: string
  email: string

  // Tools (step 5)
  versionManager: VersionManager

  // Agentic CLIs
  agenticClis: AgenticCli[]

  // Editors (step 9)
  editors: EditorChoice[]

  // Ngrok (step 10)
  setupNgrok: boolean
  ngrokDomain: string
  ngrokAuthtoken: string

  // Cognito (step 11)
  setupCognito: boolean

  // SSH key (set by SSHSetup wizard step)
  sshKeyPath: string

  // AWS (set by AWSSetup wizard step)
  awsAuthenticated: boolean

  // Dev environment (step 12)
  branchSpecificDb: boolean
  restoreDb: boolean
}

export const DEFAULT_CONFIG: SetupConfig = {
  fullName: '',
  email: '',
  versionManager: 'mise',
  agenticClis: ['opencode'],
  editors: [],
  sshKeyPath: '',
  awsAuthenticated: false,
  setupNgrok: false,
  ngrokDomain: '',
  ngrokAuthtoken: '',
  setupCognito: false,
  branchSpecificDb: false,
  restoreDb: true
}

function getIdentityFromSystem(): { fullName: string; email: string } {
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

// ── The 13 setup tasks from welcome.sh ─────────────────
export type SetupTask = {
  id: number
  icon: string
  name: string
  description: string
  dependsOn: number[] // task IDs that must complete first
}

export const SETUP_TASKS: SetupTask[] = [
  {
    id: 1,
    icon: '📦',
    name: 'Install system packages',
    description: 'Homebrew, Brewfile (30+ packages), direnv',
    dependsOn: []
  },
  {
    id: 2,
    icon: '🐳',
    name: 'Setup Docker',
    description: 'Colima, container runtime, hello-world test',
    dependsOn: [1]
  },
  {
    id: 3,
    icon: '🐙',
    name: 'Configure git identity',
    description: 'SSH keys, GitHub access, SSO authorization',
    dependsOn: [1]
  },
  {
    id: 4,
    icon: '🧰',
    name: 'Clone Factorial repository',
    description: 'factorialco/factorial, git perf, direnv allow',
    dependsOn: [3]
  },
  {
    id: 5,
    icon: '🔌',
    name: 'Setup version manager',
    description: 'Install language runtimes (Ruby, Node, Python)',
    dependsOn: [4]
  },
  {
    id: 6,
    icon: '🔑',
    name: 'Configure AWS credentials',
    description: 'AWS SSO login, development profile',
    dependsOn: [4]
  },
  {
    id: 7,
    icon: '🤫',
    name: 'Update secrets',
    description: 'Retrieve secrets from AWS Secrets Manager',
    dependsOn: [6]
  },
  {
    id: 8,
    icon: '🔏',
    name: 'Setup local hosts file',
    description: 'Add 27 entries to /etc/hosts',
    dependsOn: [1]
  },
  {
    id: 9,
    icon: '🔧',
    name: 'Install editor extensions',
    description: 'VS Code/Cursor extensions',
    dependsOn: [1]
  },
  {
    id: 10,
    icon: '🌐',
    name: 'Configure Ngrok tunnel',
    description: 'Domain, authtoken, tunnel test',
    dependsOn: [4]
  },
  {
    id: 11,
    icon: '🪪',
    name: 'Setup Cognito authentication',
    description: 'KMS, IAM, Lambda, User Pool provisioning',
    dependsOn: [4, 7, 10]
  },
  {
    id: 12,
    icon: '💻',
    name: 'Setup development environment',
    description: 'Install deps, docker-compose, DB setup',
    dependsOn: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  },
  {
    id: 13,
    icon: '🤖',
    name: 'Install agent skills',
    description: 'npx skills add for 5 skill repos',
    dependsOn: [1]
  }
]

// ── Wizard navigation steps (screens) ──────────────────
export const WIZARD_STEPS = [
  'Welcome',
  'Identity',
  'Tools',
  'Services',
  'Review',
  'SSHSetup',
  'AWSSetup',
  'Install'
] as const

export type WizardStep = (typeof WIZARD_STEPS)[number]

// ── Context ────────────────────────────────────────────
type WizardContextType = {
  config: SetupConfig
  updateConfig: (partial: Partial<SetupConfig>) => void
  currentStep: number
  goNext: () => void
  goBack: () => void
  goToStep: (step: number) => void
  totalSteps: number
}

const WizardContext = createContext<WizardContextType>(null!)

export function useWizard() {
  return useContext(WizardContext)
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SetupConfig>(() => {
    const identity = getIdentityFromSystem()
    return { ...DEFAULT_CONFIG, ...identity }
  })
  const [currentStep, setCurrentStep] = useState(0)
  const totalSteps = WIZARD_STEPS.length

  const updateConfig = (partial: Partial<SetupConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }))
  }

  const goNext = () => setCurrentStep((s) => Math.min(s + 1, totalSteps - 1))
  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 0))
  const goToStep = (step: number) => setCurrentStep(step)

  return (
    <WizardContext.Provider
      value={{ config, updateConfig, currentStep, goNext, goBack, goToStep, totalSteps }}
    >
      {children}
    </WizardContext.Provider>
  )
}
