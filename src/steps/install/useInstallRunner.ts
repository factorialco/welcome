import { useState, useEffect, useRef } from 'react'
import { useWizard, clearSavedConfig } from '../../context/index.js'
import {
  TASK_RUNNERS,
  warmupSudo,
  type ProgressCallback,
  type TaskResult,
} from '../../commands/index.js'
import { buildTaskStates, canStart, hasFailedDependency, type TaskState } from './taskState.js'

export type InstallRunner = {
  tasks: TaskState[]
  finished: boolean
  totalDuration: number
  sudoReady: boolean
  percent: number
  /** Reset all failed tasks to pending and resume the run. No-op if none failed. */
  retryFailed: () => void
}

/**
 * Drives the parallel installation: warms up sudo, then repeatedly starts any
 * task whose dependencies are satisfied, cascading failures and finalizing when
 * everything has settled.
 */
export function useInstallRunner(): InstallRunner {
  const { config } = useWizard()
  const [tasks, setTasks] = useState<TaskState[]>(() => buildTaskStates(config))
  const [finished, setFinished] = useState(false)
  const [startTime] = useState(() => Date.now())
  const [totalDuration, setTotalDuration] = useState(0)
  const [sudoReady, setSudoReady] = useState(false)

  // Track which tasks we've already kicked off so we don't double-start
  const startedRef = useRef<Set<number>>(new Set())

  const doneTasks = tasks.filter(
    (t) => t.status === 'done' || t.status === 'skipped' || t.status === 'failed'
  )
  const percent = Math.round((doneTasks.length / tasks.length) * 100)

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
              ? {
                  ...t,
                  status: 'failed',
                  error: 'Dependency failed',
                  currentSubtask: undefined,
                }
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
                  currentSubtask: undefined,
                }
              : t
          )
        )
      })
    }
  }, [tasks, finished, sudoReady, config, startTime])

  const retryFailed = () => {
    const failedIds = new Set(tasks.filter((t) => t.status === 'failed').map((t) => t.id))
    if (failedIds.size === 0) return
    failedIds.forEach((id) => startedRef.current.delete(id))
    setTasks((prev) =>
      prev.map((t) =>
        failedIds.has(t.id) ? { ...t, status: 'pending', error: undefined, duration: undefined } : t
      )
    )
    setFinished(false)
  }

  return { tasks, finished, totalDuration, sudoReady, percent, retryFailed }
}
