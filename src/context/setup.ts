import type { SetupConfig, SetupTask } from "./types.js";

// ── Brand ──────────────────────────────────────────────
export const BRAND_COLOR = "#ff365f";

// ── Default config ─────────────────────────────────────
export const DEFAULT_CONFIG: SetupConfig = {
  fullName: "",
  email: "",
  versionManager: "mise",
  agenticClis: ["opencode"],
  editors: [],
  sshKeyPath: "",
  awsAuthenticated: false,
  setupNgrok: false,
  ngrokDomain: "",
  ngrokAuthtoken: "",
  setupCognito: false,
  branchSpecificDb: false,
  restoreDb: true,
};

// ── The setup tasks from welcome.sh ────────────────────
export const SETUP_TASKS: SetupTask[] = [
  {
    id: 1,
    icon: "▸",
    name: "Install system packages",
    description: "Homebrew, Brewfile (30+ packages), direnv, tmux",
    dependsOn: [],
  },
  {
    id: 2,
    icon: "▸",
    name: "Setup Docker",
    description: "Colima, container runtime, hello-world test",
    dependsOn: [1],
  },
  {
    id: 3,
    icon: "▸",
    name: "Configure git identity",
    description: "SSH keys, GitHub access, SSO authorization",
    dependsOn: [1],
  },
  {
    id: 4,
    icon: "▸",
    name: "Clone Factorial repository",
    description: "factorialco/factorial, git perf, direnv allow",
    dependsOn: [3],
  },
  {
    id: 5,
    icon: "▸",
    name: "Setup version manager",
    description: "Install language runtimes (Ruby, Node, Python)",
    dependsOn: [4],
  },
  {
    id: 6,
    icon: "▸",
    name: "Configure AWS credentials",
    description: "AWS SSO login, development profile",
    dependsOn: [4],
  },
  {
    id: 7,
    icon: "▸",
    name: "Update secrets",
    description: "Retrieve secrets from AWS Secrets Manager",
    dependsOn: [6],
  },
  {
    id: 8,
    icon: "▸",
    name: "Setup local hosts file",
    description: "Add 27 + 16 slot entries to /etc/hosts",
    dependsOn: [1],
  },
  {
    id: 9,
    icon: "▸",
    name: "Install editor extensions",
    description: "VS Code/Cursor extensions",
    dependsOn: [1, 3],
  },
  {
    id: 10,
    icon: "▸",
    name: "Configure Ngrok tunnel",
    description: "Domain, authtoken, tunnel test",
    dependsOn: [4],
  },
  {
    id: 11,
    icon: "▸",
    name: "Setup Cognito authentication",
    description: "KMS, IAM, Lambda, User Pool provisioning",
    dependsOn: [4, 7, 10],
  },
  {
    id: 12,
    icon: "▸",
    name: "Conductor ECR login",
    description:
      "docker login to the Conductor ECR registry (before pulling the image)",
    dependsOn: [2, 6],
  },
  {
    id: 13,
    icon: "▸",
    name: "Setup development environment",
    description:
      "Install deps, docker compose (incl. conductor), DB setup + conductor:setup, tmuxinator",
    dependsOn: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  },
  {
    id: 14,
    icon: "▸",
    name: "Install agent skills",
    description: "npx skills add for 5 skill repos",
    dependsOn: [1],
  },
];

// ── Wizard navigation steps (screens) ──────────────────
export const WIZARD_STEPS = [
  "Welcome",
  "Identity",
  "Tools",
  "Services",
  "Review",
  "SSHSetup",
  "AWSSetup",
  "Install",
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];
