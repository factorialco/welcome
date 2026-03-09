import React, { useState, useEffect, useRef } from 'react'
import { Box, Text, useApp, useInput } from 'ink'
import Spinner from 'ink-spinner'
import Gradient from 'ink-gradient'
import BigText from 'ink-big-text'
import { useWizard, SETUP_TASKS, BRAND_COLOR, editorChoiceLabel, clearSavedConfig, type SetupConfig } from '../context.js'
import { StepContainer } from '../components/StepContainer.js'
import { ProgressBar } from '../components/UI.js'
import { TASK_RUNNERS, warmupSudo, type ProgressCallback, type TaskResult } from '../commands.js'
import { isDarwin } from '../platform.js'

type TaskStatus = 'pending' | 'waiting' | 'running' | 'done' | 'skipped' | 'failed'

type TaskState = {
  id: number
  icon: string
  name: string
  status: TaskStatus
  detail: string
  duration?: number
  error?: string
  subtasks: string[]
  currentSubtask?: number
}

function buildTaskStates(config: SetupConfig): TaskState[] {
  return SETUP_TASKS.map((task) => {
    const skipped =
      (task.id === 10 && !config.setupNgrok) || (task.id === 11 && !config.setupCognito)

    const subtasks = getSubtasks(task.id, config)

    return {
      id: task.id,
      icon: task.icon,
      name: task.name,
      status: skipped ? 'skipped' : 'pending',
      detail: task.description,
      subtasks
    }
  })
}

function getSubtasks(taskId: number, config: SetupConfig): string[] {
  switch (taskId) {
    case 1:
      return [
        'Checking package manager...',
        'Preparing package list...',
        'Installing packages...',
        'Configuring direnv...'
      ]
    case 2:
      return [
        'Verifying Docker setup...',
        'Installing container runtime...',
        'Configuring runtime...',
        'Starting container runtime...',
        'Testing docker...'
      ]
    case 3:
      return [
        'Configuring git identity...',
        'Verifying SSH access...'
      ]
    case 4:
      return [
        'Cloning factorialco/factorial (patience!)...',
        'Configuring git fsmonitor...',
        'Configuring git untrackedCache...',
        'Running direnv allow...'
      ]
    case 5:
      return [
        `Installing ${config.versionManager}...`,
        'Installing plugin: rust...',
        'Installing plugin: ruby...',
        'Installing plugin: nodejs...',
        'Installing plugin: python...',
        'Copying .factorialrc...',
        'Installing all versions...'
      ]
    case 6:
      return [
        'Copying AWS config...',
        'Verifying AWS session...'
      ]
    case 7:
      return ['Retrieving development/factorial/env...', 'Writing .envrc.localdev_secrets...']
    case 8:
      return [
        'Reading current /etc/hosts...',
        'Adding 27 entries for *.local.factorial.dev...',
        'Writing /etc/hosts (requires admin)...'
      ]
    case 9:
      return config.editors.length === 0
        ? ['Skipping editor extensions (no editors selected)...']
        : [
            ...config.editors.map((e) => `Installing ${editorChoiceLabel(e)} extensions...`),
            'Installing custom .vsix from factorialco/devenv-vscode-extensions...'
          ]
    case 10:
      return [
        `Configuring Ngrok domain: ${config.ngrokDomain || 'default'}...`,
        'Setting authtoken...',
        'Testing tunnel...',
        'Saving to .envrc.personal...'
      ]
    case 11:
      return [
        'Provisioning KMS key...',
        'Creating IAM Role...',
        'Deploying Lambda function...',
        'Creating Cognito User Pool...',
        'Creating User Pool Client...',
        'Configuring domain...',
        'Storing secrets in Secrets Manager...'
      ]
    case 12:
      return [
        'yarn install / pnpm install...',
        'bundle install...',
        'Setting up shadowdog...',
        'docker-compose up -d...',
        'Waiting for MySQL readiness...',
        config.restoreDb
          ? 'Restoring database from backup...'
          : 'Running db:create + db:migrate...'
      ]
    case 13:
      return [
        'npx skills add factorialco/factorial-skills...',
      ]
    default:
      return []
  }
}

function canStart(taskId: number, tasks: TaskState[]): boolean {
  const task = SETUP_TASKS.find((t) => t.id === taskId)
  if (!task) return false
  return task.dependsOn.every((depId) => {
    const dep = tasks.find((t) => t.id === depId)
    return dep && (dep.status === 'done' || dep.status === 'skipped' || dep.status === 'failed')
  })
}

function hasFailedDependency(taskId: number, tasks: TaskState[]): boolean {
  const task = SETUP_TASKS.find((t) => t.id === taskId)
  if (!task) return false
  return task.dependsOn.some((depId) => {
    const dep = tasks.find((t) => t.id === depId)
    return dep && dep.status === 'failed'
  })
}

export function InstallStep() {
  const { config } = useWizard()
  const { exit } = useApp()
  const [tasks, setTasks] = useState<TaskState[]>(() => buildTaskStates(config))
  const [finished, setFinished] = useState(false)
  const [startTime] = useState(() => Date.now())
  const [totalDuration, setTotalDuration] = useState(0)
  const [sudoReady, setSudoReady] = useState(false)

  // Track which tasks we've already kicked off so we don't double-start
  const startedRef = useRef<Set<number>>(new Set())

  const activeTasks = tasks.filter((t) => t.status !== 'skipped')
  const doneTasks = tasks.filter(
    (t) => t.status === 'done' || t.status === 'skipped' || t.status === 'failed'
  )
  const percent = Math.round((doneTasks.length / tasks.length) * 100)

  // Handle keyboard input on the completion screen
  useInput((input, key) => {
    if (!finished) return
    const hasFailures = tasks.some((t) => t.status === 'failed')
    if ((input === 'r' || input === 'R') && hasFailures) {
      // Reset all failed tasks back to pending and re-run them
      const failedIds = new Set(tasks.filter((t) => t.status === 'failed').map((t) => t.id))
      failedIds.forEach((id) => startedRef.current.delete(id))
      setTasks((prev) =>
        prev.map((t) =>
          failedIds.has(t.id)
            ? { ...t, status: 'pending', error: undefined, duration: undefined }
            : t
        )
      )
      setFinished(false)
    }
    if (key.return) {
      exit()
    }
  })

  // Warm up sudo credentials before starting parallel tasks
  useEffect(() => {
    warmupSudo().finally(() => setSudoReady(true))
  }, [])

  // Find runnable tasks and start them
  useEffect(() => {
    if (!sudoReady || finished) return

    const allDone = tasks.every(
      (t) => t.status === 'done' || t.status === 'skipped' || t.status === 'failed'
    )
    if (allDone) {
      setTotalDuration(Date.now() - startTime)
      setFinished(true)
      // Clear saved config if all tasks succeeded (no failures)
      if (!tasks.some((t) => t.status === 'failed')) {
        clearSavedConfig()
      }
      return
    }

    // Find tasks that can start (dependencies met, currently pending, not already started)
    const runnableTasks = tasks.filter(
      (t) => t.status === 'pending' && canStart(t.id, tasks) && !startedRef.current.has(t.id)
    )

    if (runnableTasks.length === 0) return

    // Start all runnable tasks (parallel execution where dependencies allow)
    for (const task of runnableTasks) {
      startedRef.current.add(task.id)

      // If a dependency failed, cascade the failure instead of running the task
      if (hasFailedDependency(task.id, tasks)) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? { ...t, status: 'failed', error: 'Dependency failed', currentSubtask: undefined }
              : t
          )
        )
        continue
      }

      // Mark as running
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: 'running', currentSubtask: 0 } : t))
      )

      // Get the real task runner
      const runner = TASK_RUNNERS[task.id]
      if (!runner) continue

      // Create progress callback
      const onProgress: ProgressCallback = (subtaskIndex: number, detail: string) => {
        setTasks((prev) =>
          prev.map((t) => (t.id === task.id ? { ...t, currentSubtask: subtaskIndex, detail } : t))
        )
      }

      // Run the task asynchronously
      runner(config, onProgress).then((result: TaskResult) => {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? {
                  ...t,
                  status: result.success ? 'done' : 'failed',
                  duration: result.duration,
                  error: result.error,
                  currentSubtask: undefined
                }
              : t
          )
        )
      })
    }
  }, [tasks, finished, sudoReady])

  if (!sudoReady) {
    const isMac = isDarwin()
    return (
      <StepContainer
        title="Administrator Access Required"
        subtitle="Some tasks need to modify system files (e.g., /etc/hosts)."
      >
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column">
            {isMac ? (
              <Text>A system dialog will appear asking for your password.</Text>
            ) : (
              <Text>Please enter your password below when prompted.</Text>
            )}
          </Box>

          <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={2} paddingY={0}>
            <Text color="yellow" bold>Important:</Text>
            <Text color="yellow">
              You must have enabled <Text bold>"Root permissions"</Text> in the{' '}
              <Text bold>Self Service+</Text> application before continuing.
            </Text>
            <Text color="yellow">
              If you haven't, press <Text bold>Ctrl+C</Text>, enable it, and re-run the setup.
            </Text>
          </Box>

          <Box>
            <Text color={BRAND_COLOR}>
              <Spinner type="dots" />
            </Text>
            <Text> Waiting for administrator authentication...</Text>
          </Box>
        </Box>
      </StepContainer>
    )
  }

  if (finished) {
    const completedCount = tasks.filter((t) => t.status === 'done').length
    const skippedCount = tasks.filter((t) => t.status === 'skipped').length
    const failedCount = tasks.filter((t) => t.status === 'failed').length
    const failedTasks = tasks.filter((t) => t.status === 'failed')

    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={failedCount > 0 ? 'yellow' : 'green'}
        paddingX={2}
        paddingY={1}
        minHeight={14}
        alignItems="center"
        justifyContent="center"
      >
        <Gradient name="rainbow">
          <BigText text={failedCount > 0 ? 'DONE*' : 'DONE!'} font="chrome" />
        </Gradient>

        <Box marginTop={1} justifyContent="center">
          <Text bold color={BRAND_COLOR}>
            {'─── '}Environment setup {failedCount > 0 ? 'completed with errors' : 'complete!'}
            {' ───'}
          </Text>
        </Box>

        <Box marginTop={1} flexDirection="column" alignItems="center">
          <Text>
            <Text color="green" bold>
              ✓
            </Text>{' '}
            {completedCount} tasks completed successfully
          </Text>
          {skippedCount > 0 && (
            <Text>
              <Text color="gray">○</Text> {skippedCount} tasks skipped
            </Text>
          )}
          {failedCount > 0 && (
            <Text>
              <Text color="red" bold>
                ✗
              </Text>{' '}
              {failedCount} tasks failed
            </Text>
          )}
          <Text>
            <Text color="green" bold>
              ✓
            </Text>{' '}
            Total time: {(totalDuration / 1000).toFixed(1)}s
          </Text>
        </Box>

        {failedTasks.length > 0 && (
          <Box
            marginTop={1}
            borderStyle="single"
            borderColor="red"
            paddingX={2}
            paddingY={0}
            flexDirection="column"
          >
            <Text bold color="red">
              Failed tasks:
            </Text>
            {failedTasks.map((t) => (
              <Text key={t.id}>
                {'  '}
                {t.icon} {t.name}: <Text color="red">{t.error || 'Unknown error'}</Text>
              </Text>
            ))}
          </Box>
        )}

        <Box marginTop={1} borderStyle="single" borderColor={BRAND_COLOR} paddingX={2} paddingY={0}>
          <Box flexDirection="column" alignItems="center">
            <Text bold color={BRAND_COLOR}>
              Next steps:
            </Text>
            <Text>
              {'  '}1. <Text bold>cd ~/code/factorial</Text>
            </Text>
            {config.agenticClis.length > 0 && (
              <Text>
                {'  '}2. <Text bold>{config.agenticClis[0]}</Text>
                <Text dimColor>  (start coding with AI assistance)</Text>
              </Text>
            )}
            <Text>
              {'  '}{config.agenticClis.length > 0 ? '3' : '2'}. Open <Text bold>https://app.local.factorial.dev</Text>
            </Text>
          </Box>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>
            {failedCount > 0 ? (
              <>
                Press <Text color="gray">r</Text> to retry failed tasks{' '}
                <Text color="gray">|</Text>{' '}
                <Text color="gray">Enter</Text> to exit
              </>
            ) : (
              <>
                Happy coding! Press <Text color="gray">Enter</Text> to exit.
              </>
            )}
          </Text>
        </Box>
      </Box>
    )
  }

  // Show tasks grouped by status with dependency visualization
  return (
    <StepContainer
      title="Installing..."
      subtitle={`Running ${tasks.length} tasks with parallel execution`}
    >
      <Box flexDirection="column" gap={0}>
        <ProgressBar percent={percent} color="green" label="Overall Progress" />
        <Text> </Text>

        {tasks.map((task) => {
          if (task.status === 'skipped') {
            return (
              <Text key={task.id} dimColor>
                <Text color="gray">{'⊘ '}</Text>
                <Text strikethrough>
                  {task.icon} {task.name}
                </Text>
                <Text> (skipped)</Text>
              </Text>
            )
          }

          const statusIcon =
            task.status === 'done'
              ? '✓'
              : task.status === 'failed'
              ? '✗'
              : task.status === 'running'
              ? ''
              : task.status === 'waiting'
              ? '…'
              : '○'

          const statusColor =
            task.status === 'done'
              ? 'green'
              : task.status === 'failed'
              ? 'red'
              : task.status === 'running'
              ? BRAND_COLOR
              : 'gray'

          return (
            <Box key={task.id} flexDirection="column">
              <Text>
                {task.status === 'running' ? (
                  <Text color={BRAND_COLOR}>
                    <Spinner type="dots" />{' '}
                  </Text>
                ) : (
                  <Text
                    color={statusColor}
                    bold={task.status === 'done' || task.status === 'failed'}
                  >
                    {statusIcon}{' '}
                  </Text>
                )}
                <Text
                  color={
                    task.status === 'pending' ? 'gray' : task.status === 'failed' ? 'red' : 'white'
                  }
                  bold={task.status === 'running'}
                  dimColor={task.status === 'pending'}
                >
                  {task.icon} {task.name}
                </Text>
                {task.status === 'done' && task.duration && (
                  <Text dimColor> ({(task.duration / 1000).toFixed(1)}s)</Text>
                )}
                {task.status === 'failed' && <Text color="red"> (FAILED)</Text>}
              </Text>
              {task.status === 'running' &&
                task.currentSubtask !== undefined &&
                task.subtasks[task.currentSubtask] && (
                  <Text dimColor>
                    {'    '}
                    {task.subtasks[task.currentSubtask]}{' '}
                    <Text color="gray">
                      ({task.currentSubtask + 1}/{task.subtasks.length})
                    </Text>
                  </Text>
                )}
              {task.status === 'failed' && task.error && (
                <Text color="red">
                  {'    '}
                  {task.error}
                </Text>
              )}
            </Box>
          )
        })}
      </Box>
    </StepContainer>
  )
}
