import type { PreflightResult } from "../commands/index.js";

// ── Config value types (match welcome.sh user prompts) ──
export type VersionManager = "mise" | "asdf";
export type AgenticCli = "opencode" | "claude" | "codex";
export type EditorChoice = "cursor" | "vscode";

export type SetupConfig = {
  // Git identity (step 3)
  fullName: string;
  email: string;

  // Tools (step 5)
  versionManager: VersionManager;

  // Agentic CLIs
  agenticClis: AgenticCli[];

  // Editors (step 9)
  editors: EditorChoice[];

  // Ngrok (step 10)
  setupNgrok: boolean;
  ngrokDomain: string;
  ngrokAuthtoken: string;

  // Cognito (step 11)
  setupCognito: boolean;

  // SSH key (set by SSHSetup wizard step)
  sshKeyPath: string;

  // AWS (set by AWSSetup wizard step)
  awsAuthenticated: boolean;

  // Dev environment (step 12)
  branchSpecificDb: boolean;
  restoreDb: boolean;
};

// ── Persisted wizard state ─────────────────────────────
export type SavedState = {
  config: SetupConfig;
  currentStep: number;
  savedAt: string;
};

// ── Setup task descriptor ──────────────────────────────
export type SetupTask = {
  id: number;
  icon: string;
  name: string;
  description: string;
  dependsOn: number[]; // task IDs that must complete first
};

// ── Wizard context shape ───────────────────────────────
export type WizardContextType = {
  config: SetupConfig;
  updateConfig: (partial: Partial<SetupConfig>) => void;
  currentStep: number;
  goNext: () => void;
  goBack: () => void;
  goToStep: (step: number) => void;
  /** Navigate to a step and return to the current step when done */
  goToStepAndReturn: (step: number) => void;
  /** If set, goNext/goBack should return here instead of normal navigation */
  returnToStep: number | null;
  /** Clear the return-to bookmark and jump back */
  completeReturn: () => void;
  totalSteps: number;
  /** Restore a previously saved session */
  restoreSession: (saved: SavedState) => void;
  /** Clear saved config file from disk */
  clearSavedConfig: () => void;
  // Pre-flight checks
  preflightResults: PreflightResult[];
  preflightDone: boolean;
  preflightHasBlocker: boolean;
  /** (Re)run pre-flight checks */
  runPreflight: () => void;
};
