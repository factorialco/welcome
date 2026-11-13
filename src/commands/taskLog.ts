import { AsyncLocalStorage } from 'node:async_hooks'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { TASK_LOG_DIR } from './constants.js'

/**
 * Per-task log files.
 *
 * Every setup task runs inside `runWithTaskLog()`, so every command it spawns
 * (through runCommand) also writes its output to that task's own file under
 * TASK_LOG_DIR, besides the combined LOG_FILE. Tasks run in parallel, so the
 * combined log interleaves them; the per-task file is what the completion
 * screen shows when a task fails.
 */
const taskLogStorage = new AsyncLocalStorage<string>()

/** Path of the log file for a task, e.g. /tmp/welcome-logs/04-clone-factorial-repository.log */
export function taskLogPath(taskId: number, taskName: string): string {
  const slug = taskName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return path.join(TASK_LOG_DIR, `${String(taskId).padStart(2, '0')}-${slug}.log`)
}

/** Run `fn` with its commands' output also written to `logFile`, which starts empty. */
export function runWithTaskLog<T>(logFile: string, fn: () => Promise<T>): Promise<T> {
  try {
    mkdirSync(path.dirname(logFile), { recursive: true })
    writeFileSync(logFile, `# ${new Date().toISOString()}\n`)
  } catch {
    // Logging must never break the setup itself
  }
  return taskLogStorage.run(logFile, fn)
}

/** The log file of the task running in the current async context, if any. */
export function currentTaskLog(): string | undefined {
  return taskLogStorage.getStore()
}

/** Append text to a task's log file, ignoring errors. */
export function appendTaskLog(logFile: string, text: string): void {
  try {
    appendFileSync(logFile, text.endsWith('\n') ? text : text + '\n')
  } catch {
    // ignore
  }
}

/** Last `lines` non-empty lines of a log file, with ANSI escapes and carriage-return redraws removed. */
export function readLogTail(logFile: string, lines: number): string[] {
  let content: string
  try {
    content = readFileSync(logFile, 'utf-8')
  } catch {
    return []
  }
  return (
    content
      // eslint-disable-next-line no-control-regex
      .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
      .split('\n')
      // Progress bars redraw with \r: keep only the final state of each line
      .map((l) => l.split('\r').filter(Boolean).pop() ?? '')
      .filter((l) => l.trim() !== '' && !l.startsWith('# '))
      .slice(-lines)
  )
}
