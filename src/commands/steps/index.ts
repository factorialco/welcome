import { type SetupConfig } from '../../context/index.js'
import { type ProgressCallback, type TaskResult } from '../helpers.js'
import { runStep1 } from './01-system-packages.js'
import { runStep2 } from './02-docker.js'
import { runStep3 } from './03-git-identity.js'
import { runStep4 } from './04-clone-repo.js'
import { runStep5 } from './05-version-manager.js'
import { runStep6 } from './06-aws-credentials.js'
import { runStep7 } from './07-secrets.js'
import { runStep8 } from './08-hosts-file.js'
import { runStep9 } from './09-editor-extensions.js'
import { runStep10 } from './10-ngrok.js'
import { runStep11 } from './11-cognito.js'
import { runStep12 } from './12-conductor-ecr-login.js'
import { runStep13 } from './13-dev-environment.js'
import { runStep14 } from './14-agent-skills.js'

export type TaskRunner = (config: SetupConfig, onProgress: ProgressCallback) => Promise<TaskResult>

export const TASK_RUNNERS: Record<number, TaskRunner> = {
  1: runStep1,
  2: runStep2,
  3: runStep3,
  4: runStep4,
  5: runStep5,
  6: runStep6,
  7: runStep7,
  8: runStep8,
  9: runStep9,
  10: runStep10,
  11: runStep11,
  12: runStep12,
  13: runStep13,
  14: runStep14,
}
