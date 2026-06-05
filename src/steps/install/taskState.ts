import {
  SETUP_TASKS,
  editorChoiceLabel,
  type SetupConfig,
} from "../../context/index.js";

export type TaskStatus =
  | "pending"
  | "waiting"
  | "running"
  | "done"
  | "skipped"
  | "failed";

export type TaskState = {
  id: number;
  icon: string;
  name: string;
  status: TaskStatus;
  detail: string;
  duration?: number;
  error?: string;
  subtasks: string[];
  currentSubtask?: number;
};

export function buildTaskStates(config: SetupConfig): TaskState[] {
  return SETUP_TASKS.map((task) => {
    const skipped =
      (task.id === 10 && !config.setupNgrok) ||
      (task.id === 11 && !config.setupCognito);

    const subtasks = getSubtasks(task.id, config);

    return {
      id: task.id,
      icon: task.icon,
      name: task.name,
      status: skipped ? "skipped" : "pending",
      detail: task.description,
      subtasks,
    };
  });
}

export function getSubtasks(taskId: number, config: SetupConfig): string[] {
  switch (taskId) {
    case 1:
      return [
        "Checking package manager...",
        "Preparing package list...",
        "Installing packages...",
        "Configuring direnv...",
      ];
    case 2:
      return [
        "Verifying Docker setup...",
        "Installing container runtime...",
        "Configuring runtime...",
        "Starting container runtime...",
        "Testing docker...",
      ];
    case 3:
      return ["Configuring git identity...", "Verifying SSH access..."];
    case 4:
      return [
        "Verifying SSH access to GitHub...",
        "Cloning factorialco/factorial...",
        "Configuring git fsmonitor...",
        "Configuring git untrackedCache...",
        "Running direnv allow...",
      ];
    case 5:
      return [
        `Installing ${config.versionManager}...`,
        "Installing plugin: rust...",
        "Installing plugin: ruby...",
        "Installing plugin: nodejs...",
        "Installing plugin: python...",
        "Copying .factorialrc...",
        "Installing all versions...",
      ];
    case 6:
      return ["Copying AWS config...", "Verifying AWS session..."];
    case 7:
      return [
        "Retrieving development/factorial/env...",
        "Writing .envrc.localdev_secrets...",
      ];
    case 8:
      return [
        "Reading current /etc/hosts...",
        "Adding 27 entries for *.local.factorial.dev...",
        "Writing /etc/hosts (requires admin)...",
      ];
    case 9:
      return config.editors.length === 0
        ? ["Skipping editor extensions (no editors selected)..."]
        : [
            ...config.editors.map(
              (e) => `Installing ${editorChoiceLabel(e)} extensions...`,
            ),
            "Installing custom .vsix from factorialco/devenv-vscode-extensions...",
          ];
    case 10:
      return [
        `Configuring Ngrok domain: ${config.ngrokDomain || "default"}...`,
        "Setting authtoken...",
        "Testing tunnel...",
        "Saving to .envrc.personal...",
      ];
    case 11:
      return [
        "Provisioning KMS key...",
        "Creating IAM Role...",
        "Deploying Lambda function...",
        "Creating Cognito User Pool...",
        "Creating User Pool Client...",
        "Configuring domain...",
        "Storing secrets in Secrets Manager...",
      ];
    case 12:
      return ["Logging in to Conductor ECR registry..."];
    case 13:
      return [
        "yarn install / pnpm install...",
        "bundle install...",
        "Setting up shadowdog...",
        "docker compose up -d...",
        "Starting Conductor services...",
        "Waiting for MySQL readiness...",
        config.restoreDb
          ? "Restoring database from backup..."
          : "Running db:create + db:migrate...",
      ];
    case 14:
      return ["npx skills add factorialco/factorial-skills..."];
    default:
      return [];
  }
}

export function canStart(taskId: number, tasks: TaskState[]): boolean {
  const task = SETUP_TASKS.find((t) => t.id === taskId);
  if (!task) return false;
  return task.dependsOn.every((depId) => {
    const dep = tasks.find((t) => t.id === depId);
    return (
      dep &&
      (dep.status === "done" ||
        dep.status === "skipped" ||
        dep.status === "failed")
    );
  });
}

export function hasFailedDependency(
  taskId: number,
  tasks: TaskState[],
): boolean {
  const task = SETUP_TASKS.find((t) => t.id === taskId);
  if (!task) return false;
  return task.dependsOn.some((depId) => {
    const dep = tasks.find((t) => t.id === depId);
    return dep && dep.status === "failed";
  });
}
