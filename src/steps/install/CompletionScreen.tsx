import { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import Gradient from 'ink-gradient'
import BigText from 'ink-big-text'
import { useWizard, BRAND_COLOR } from '../../context/index.js'
import { readLogTail } from '../../commands/index.js'
import type { TaskState } from './taskState.js'

const LOG_TAIL_LINES = 15

/** A failure that only cascaded from a failed dependency, so the task never ran. */
function isCascadedFailure(task: TaskState): boolean {
  return !task.logFile
}

/** Final summary screen shown once every task has settled. */
export function CompletionScreen({
  tasks,
  totalDuration,
}: {
  tasks: TaskState[]
  totalDuration: number
}) {
  const { config } = useWizard()
  const completedCount = tasks.filter((t) => t.status === 'done').length
  const skippedCount = tasks.filter((t) => t.status === 'skipped').length
  const failedCount = tasks.filter((t) => t.status === 'failed').length
  const failedTasks = tasks.filter((t) => t.status === 'failed')
  const willOnboard = failedCount === 0 && config.agenticClis.length > 0

  // Start on the first task that actually ran and failed: that is the root cause
  const [selected, setSelected] = useState(() =>
    Math.max(
      0,
      failedTasks.findIndex((t) => !isCascadedFailure(t))
    )
  )
  const [showLog, setShowLog] = useState(true)
  const selectedTask = failedTasks[Math.min(selected, failedTasks.length - 1)]

  useInput((input, key) => {
    if (failedTasks.length === 0) return
    if (key.upArrow) setSelected((i) => (i - 1 + failedTasks.length) % failedTasks.length)
    if (key.downArrow) setSelected((i) => (i + 1) % failedTasks.length)
    if (input === 'l' || input === 'L') setShowLog((v) => !v)
  })

  const logTail =
    selectedTask?.logFile && showLog ? readLogTail(selectedTask.logFile, LOG_TAIL_LINES) : []

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
          {failedTasks.map((t, i) => {
            const isSelected = t === selectedTask
            return (
              <Text key={t.id} wrap="truncate-end">
                <Text color={BRAND_COLOR}>{isSelected ? '❯ ' : '  '}</Text>
                <Text bold={isSelected}>
                  {t.icon} {t.name}:
                </Text>{' '}
                <Text color="red" dimColor={isCascadedFailure(t)}>
                  {(t.error || 'Unknown error').split('\n')[0]}
                </Text>
                {i === 0 && failedTasks.length > 1 && <Text dimColor> (↑↓ to select)</Text>}
              </Text>
            )
          })}
          {selectedTask && (
            <FailureDetail task={selectedTask} logTail={logTail} showLog={showLog} />
          )}
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
              <Text dimColor> (start coding with AI assistance)</Text>
            </Text>
          )}
          <Text>
            {'  '}
            {config.agenticClis.length > 0 ? '3' : '2'}. <Text bold>.local-dev/quickstart.sh</Text>
            <Text dimColor> (quick start the application)</Text>
          </Text>
          <Text>
            {'  '}
            {config.agenticClis.length > 0 ? '4' : '3'}. Open{' '}
            <Text bold>https://app.local.factorial.dev</Text>
          </Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          {failedCount > 0 ? (
            <>
              <Text color="gray">↑↓</Text> select failed task <Text color="gray">|</Text>{' '}
              <Text color="gray">l</Text> {showLog ? 'hide' : 'show'} log{' '}
              <Text color="gray">|</Text> <Text color="gray">r</Text> to retry failed tasks{' '}
              <Text color="gray">|</Text> <Text color="gray">Enter</Text> to exit
            </>
          ) : willOnboard ? (
            <>
              Press <Text color="gray">Enter</Text> to start your codebase onboarding{' '}
              <Text color="gray">|</Text> <Text color="gray">q</Text> to exit
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

/** Full error and the tail of the task's own log for the selected failed task. */
function FailureDetail({
  task,
  logTail,
  showLog,
}: {
  task: TaskState
  logTail: string[]
  showLog: boolean
}) {
  const errorLines = (task.error || 'Unknown error').split('\n')
  return (
    <Box marginTop={1} flexDirection="column">
      <Text bold>
        {task.icon} {task.name}
      </Text>
      {errorLines.map((line, i) => (
        <Text key={i} color="red">
          {'  '}
          {line}
        </Text>
      ))}
      {task.logFile ? (
        <>
          {showLog && logTail.length > 0 && (
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>Last {logTail.length} lines of output:</Text>
              {logTail.map((line, i) => (
                <Text key={i} dimColor wrap="truncate-end">
                  {'  │ '}
                  {line}
                </Text>
              ))}
            </Box>
          )}
          {showLog && logTail.length === 0 && (
            <Text dimColor>{'  '}(the task produced no command output)</Text>
          )}
          <Text>
            <Text dimColor>Full log: </Text>
            <Text color={BRAND_COLOR}>{task.logFile}</Text>
          </Text>
        </>
      ) : (
        <Text dimColor>{'  '}This task did not run. Fix the task it depends on and press r.</Text>
      )}
    </Box>
  )
}
