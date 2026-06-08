import { getUserShell, isDarwin } from '../platform.js'
import { HOME } from './constants.js'
import { sh } from './helpers.js'

export type PreflightStatus = 'ok' | 'warn' | 'fail'

export type PreflightResult = {
  name: string
  status: PreflightStatus
  message: string
}

/** Detect the user's shell */
async function checkShell(): Promise<PreflightResult> {
  const shell = getUserShell()
  return { name: 'Shell', status: 'ok', message: shell }
}

/** Check macOS version (warn if < 13 Ventura). Skip on Linux. */
async function checkOSVersion(): Promise<PreflightResult> {
  if (!isDarwin()) {
    const release = await sh('uname -sr')
    return {
      name: 'OS',
      status: 'ok',
      message: release.stdout.trim() || 'Linux',
    }
  }
  const verResult = await sh('sw_vers -productVersion')
  const version = verResult.stdout.trim()
  const major = parseInt(version.split('.')[0] || '0')
  if (major < 13) {
    return {
      name: 'macOS',
      status: 'warn',
      message: `${version} (< 13 Ventura, some tools may not work)`,
    }
  }
  return { name: 'macOS', status: 'ok', message: version }
}

/** Check available disk space (warn if < 20 GB free on home partition) */
async function checkDiskSpace(): Promise<PreflightResult> {
  const dfResult = await sh(`df -k "${HOME}"`)
  if (dfResult.code !== 0) {
    return {
      name: 'Disk space',
      status: 'warn',
      message: 'Could not determine free space',
    }
  }
  // Parse df output — second line, 4th column is available KB
  const lines = dfResult.stdout.split('\n')
  if (lines.length < 2) {
    return {
      name: 'Disk space',
      status: 'warn',
      message: 'Could not parse df output',
    }
  }
  const cols = lines[1]!.trim().split(/\s+/)
  const availKB = parseInt(cols[3] || '0')
  const availGB = Math.round(availKB / 1024 / 1024)
  if (availGB < 20) {
    return {
      name: 'Disk space',
      status: 'warn',
      message: `${availGB} GB free (< 20 GB recommended)`,
    }
  }
  return { name: 'Disk space', status: 'ok', message: `${availGB} GB free` }
}

/** Check network connectivity to GitHub */
async function checkNetwork(): Promise<PreflightResult> {
  const result = await sh('curl -sI --connect-timeout 5 --max-time 10 https://github.com', {
    timeout: 15000,
  })
  if (result.code !== 0) {
    return {
      name: 'Network',
      status: 'fail',
      message: 'Cannot reach github.com (check your internet connection)',
    }
  }
  return { name: 'Network', status: 'ok', message: 'github.com reachable' }
}

/** Run all pre-flight checks and call onResult for each as it completes */
export async function runPreflightChecks(
  onResult: (result: PreflightResult, index: number) => void
): Promise<PreflightResult[]> {
  const checks = [checkShell, checkOSVersion, checkDiskSpace, checkNetwork]
  const results: PreflightResult[] = []

  for (let i = 0; i < checks.length; i++) {
    try {
      const result = await checks[i]!()
      results.push(result)
      onResult(result, i)
    } catch {
      const fallback: PreflightResult = {
        name: `Check ${i + 1}`,
        status: 'warn',
        message: 'Check failed unexpectedly',
      }
      results.push(fallback)
      onResult(fallback, i)
    }
  }

  return results
}
