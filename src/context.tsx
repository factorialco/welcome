import React, { createContext, useContext, useState, type ReactNode } from 'react'

// ── Brand ──────────────────────────────────────────────
export const BRAND_COLOR = '#ff365f'
export const BRAND_HEX = '#ff365f'

// ── Config types matching welcome.sh user prompts ──────
export type VersionManager = 'mise' | 'asdf'
export type Editor = 'cursor' | 'vscode'

export type SetupConfig = {
  // Git identity (step 3)
  fullName: string
  email: string

  // Tools (step 5)
  versionManager: VersionManager

  // Editor (step 9)
  editor: Editor
  installExtensions: boolean

  // Ngrok (step 10)
  setupNgrok: boolean
  ngrokDomain: string
  ngrokAuthtoken: string

  // Cognito (step 11)
  setupCognito: boolean

  // Dev environment (step 12)
  branchSpecificDb: boolean
  restoreDb: boolean
}

export const DEFAULT_CONFIG: SetupConfig = {
  fullName: '',
  email: '',
  versionManager: 'mise',
  editor: 'cursor',
  installExtensions: true,
  setupNgrok: true,
  ngrokDomain: '',
  ngrokAuthtoken: '',
  setupCognito: false,
  branchSpecificDb: false,
  restoreDb: true
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
    icon: '🛠️',
    name: 'Install editor extensions',
    description: '23+ VS Code/Cursor extensions',
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
    icon: '🧑‍💻',
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
  const [config, setConfig] = useState<SetupConfig>({ ...DEFAULT_CONFIG })
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
