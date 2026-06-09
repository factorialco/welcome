import { getShellArgs, isDarwin } from '../platform.js'
import { LOG_FILE } from './constants.js'
import { spawn, type ChildProcess } from 'node:child_process'
import { constants, createWriteStream } from 'node:fs'
import { access, appendFile, readFile, writeFile } from 'node:fs/promises'

/** Extract a human-readable message from an unknown caught value. */
export function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/** Escape a string for safe interpolation into a shell command */
export function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

export type ProgressCallback = (subtaskIndex: number, detail: string) => void
export type TaskResult = { success: boolean; error?: string; duration: number }

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

export async function dirExists(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Run a shell command and return its output.
 * When `interactive` is true, stdin is inherited so the user can
 * respond to prompts (sudo, aws sso login, etc.), but stdout/stderr
 * are still piped and written to the log file to avoid corrupting
 * the Ink TUI layout.
 */
export function runCommand(
  cmd: string,
  args: string[],
  options: {
    cwd?: string
    env?: Record<string, string>
    interactive?: boolean
    timeout?: number
  } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const stdio: ('inherit' | 'pipe')[] = options.interactive
      ? ['inherit', 'pipe', 'pipe']
      : ['pipe', 'pipe', 'pipe']

    const child: ChildProcess = spawn(cmd, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio,
      timeout: options.timeout,
    })

    const logStream = createWriteStream(LOG_FILE, { flags: 'a' })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', (data: Buffer) => {
      const chunk = data.toString()
      stdout += chunk
      logStream.write(chunk)
    })

    child.stderr?.on('data', (data: Buffer) => {
      const chunk = data.toString()
      stderr += chunk
      logStream.write(chunk)
    })

    child.on('error', (err) => {
      logStream.end()
      // If spawn itself failed (e.g. command not found), resolve with error code
      resolve({
        code: 1,
        stdout: stdout.trim(),
        stderr: (stderr + '\n' + err.message).trim(),
      })
    })
    child.on('close', (code) => {
      logStream.end()
      resolve({
        code: code ?? 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      })
    })
  })
}

/**
 * Run a shell command string via the user's default shell.
 *
 * By default this NEVER throws on a non-zero exit code — it returns the result
 * so callers can inspect `result.code` (many call sites legitimately tolerate
 * exit ≠ 0: `command -v`, `… || echo ""`, `… || true`, SSH probes, etc.).
 *
 * Pass `{ check: true }` to make the command "fail-loud": if the exit code is
 * non-zero it throws an Error with the command, exit code and the tail of its
 * output. Use this for critical steps that must not be silently skipped.
 */
export async function sh(
  command: string,
  options: {
    cwd?: string
    interactive?: boolean
    env?: Record<string, string>
    timeout?: number
    check?: boolean
  } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  const [shell, baseArgs] = getShellArgs()
  const result = await runCommand(shell, [...baseArgs, command], options)
  if (options.check && result.code !== 0) {
    const tail = (result.stderr || result.stdout).split('\n').slice(-15).join('\n')
    throw new Error(`Command failed (exit ${result.code}): ${command}${tail ? `\n${tail}` : ''}`)
  }
  return result
}

/**
 * Run a command with elevated (root) privileges.
 *
 * - **macOS**: uses `osascript` with `do shell script … with administrator
 *   privileges`, which shows the native macOS authentication dialog.
 *   Each invocation may prompt the user (macOS caches authorization briefly).
 *
 * - **Linux**: falls back to `sudo` with inherited stdin so the user can
 *   type their password in the terminal.
 */
export async function sudoSh(
  command: string,
  options: { cwd?: string; timeout?: number } = {}
): Promise<{ code: number; stdout: string; stderr: string }> {
  if (isDarwin()) {
    // Escape for AppleScript double-quoted string: backslashes then double quotes
    const escaped = command.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    const script = `do shell script "${escaped}" with administrator privileges`
    return runCommand('/usr/bin/osascript', ['-e', script], options)
  }
  return sh(`sudo ${command}`, { ...options, interactive: true })
}

/** Ensure a line exists in a file (append if missing) */
export async function ensureLine(filePath: string, line: string): Promise<void> {
  let content = ''
  if (await fileExists(filePath)) {
    content = await readFile(filePath, 'utf-8')
  }
  if (!content.includes(line)) {
    await appendFile(filePath, (content.endsWith('\n') || content === '' ? '' : '\n') + line + '\n')
  }
}

/** Add or update an env var in a file (matching welcome.sh's add_or_update_env_var) */
export async function addOrUpdateEnvVar(
  varName: string,
  varValue: string,
  envFile: string
): Promise<void> {
  let content = ''
  if (await fileExists(envFile)) {
    content = await readFile(envFile, 'utf-8')
  }
  const exportLine = `export ${varName}=${varValue}`
  const regex = new RegExp(`^export ${varName}=.*$`, 'm')
  if (regex.test(content)) {
    content = content.replace(regex, exportLine)
    await writeFile(envFile, content)
  } else {
    await appendFile(
      envFile,
      (content.endsWith('\n') || content === '' ? '' : '\n') + exportLine + '\n'
    )
  }
}
