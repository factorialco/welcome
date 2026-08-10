import { type SetupConfig } from '../../context/index.js'
import { getLibBuildFlags, isDarwin, isLinux } from '../../platform.js'
import { PNPM_VERSION, REPO_PATH } from '../constants.js'
import {
  getErrorMessage,
  sh,
  shellEscape,
  type ProgressCallback,
  type TaskResult,
} from '../helpers.js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

async function getBundlerVersion(backendPath: string): Promise<string> {
  const lockfile = await readFile(path.join(backendPath, 'Gemfile.lock'), 'utf-8')
  const match = lockfile.match(/^BUNDLED WITH\r?\n\s+(\S+)/m)
  if (!match?.[1]) {
    throw new Error('Could not determine the Bundler version from backend/Gemfile.lock.')
  }
  return match[1]
}

/** Step 13: Setup development environment */
export async function runStep13(
  config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    const backendPath = path.join(REPO_PATH, 'backend')
    const withRuntime = (command: string): string =>
      config.versionManager === 'mise' ? `mise exec -- ${command}` : `asdf exec ${command}`

    // 0. Install yarn/pnpm and run pnpm i
    onProgress(0, 'Installing yarn and pnpm globally...')
    await sh(withRuntime(`npm install --global yarn pnpm@${PNPM_VERSION}`), {
      cwd: REPO_PATH,
      interactive: true,
      check: true,
    })

    onProgress(1, 'Running pnpm install...')
    await sh(withRuntime('pnpm i'), { cwd: REPO_PATH, interactive: true, check: true })

    // 1. Install bundler + bundle install
    onProgress(2, 'Installing bundler and running bundle install...')
    const bundlerVersion = await getBundlerVersion(backendPath)
    await sh(withRuntime(`gem install bundler -v ${shellEscape(bundlerVersion)} --no-document`), {
      cwd: backendPath,
      check: true,
    })

    // mysql2 gem with library flags (platform-aware)
    const buildFlags = await getLibBuildFlags((cmd) => sh(cmd))

    // Safety net for the native build: export LIBRARY_PATH so the linker finds
    // libzstd/openssl even if the explicit --with-ldflags don't take effect.
    // Prepend so any pre-existing LIBRARY_PATH is preserved.
    const buildEnv: Record<string, string> = buildFlags.libraryPath
      ? {
          LIBRARY_PATH: [buildFlags.libraryPath, process.env.LIBRARY_PATH]
            .filter(Boolean)
            .join(':'),
        }
      : {}

    // Bundle config for native gem compilation — set before any gem install so
    // both the standalone gem install and bundle install pick up the right flags.
    // Needed on all macOS (not just ARM) with MySQL 9.x which requires zstd.
    if (isDarwin() || isLinux()) {
      await sh(
        withRuntime(
          `bundle config set --global build.mysql2 "--with-opt-dir=${buildFlags.optDir} --with-ldflags=${buildFlags.ldflags} --with-cppflags=${buildFlags.cppflags}"`
        ),
        { cwd: backendPath, check: true }
      )
    }

    await sh(
      withRuntime(
        `gem install mysql2 -- --with-opt-dir="${buildFlags.optDir}" --with-ldflags="${buildFlags.ldflags}" --with-cppflags="${buildFlags.cppflags}"`
      ),
      { cwd: backendPath, env: buildEnv, check: true }
    )

    // tmuxinator (terminal multiplexer session manager)
    await sh(withRuntime('gem install tmuxinator'), { cwd: backendPath, check: true })

    await sh(withRuntime('bundle install'), {
      cwd: backendPath,
      interactive: true,
      env: buildEnv,
      check: true,
    })

    // 2. Mobile + ATS deps
    onProgress(3, 'Installing mobile and ATS dependencies...')
    await sh(withRuntime('pnpm i'), {
      cwd: path.join(REPO_PATH, 'mobile'),
      interactive: true,
      check: true,
    })
    await sh(withRuntime('yarn install'), {
      cwd: path.join(REPO_PATH, 'backend', 'components', 'ats'),
      interactive: true,
      check: true,
    })

    // 3. Shadowdog
    onProgress(4, 'Running shadowdog...')
    await sh(withRuntime('pnpm shadowdog'), {
      cwd: REPO_PATH,
      interactive: true,
      check: true,
    })

    // 4. Docker compose — detect modern plugin vs legacy standalone
    const composeCmd = await (async () => {
      try {
        await sh('docker compose version', { cwd: REPO_PATH, check: true })
        return 'docker compose'
      } catch {
        try {
          await sh('docker-compose --version', { cwd: REPO_PATH, check: true })
          onProgress(
            5,
            '⚠ Legacy docker-compose detected. Consider upgrading to the Docker Compose plugin (docker compose).'
          )
          return 'docker-compose'
        } catch {
          throw new Error(
            'Neither "docker compose" nor "docker-compose" found. Please install Docker Compose.'
          )
        }
      }
    })()

    onProgress(5, 'Starting docker compose...')
    const composeCwd = path.join(REPO_PATH, '.local-dev')
    await sh(`direnv exec "${composeCwd}" ${composeCmd} up -d --force-recreate`, {
      cwd: composeCwd,
      interactive: true,
      env: { REPO_ROOT: REPO_PATH },
    })

    // Start the Conductor services (postgres + server). They currently sit
    // behind the "conductor" compose profile, so bring them up explicitly by
    // name with the profile enabled. The image pull relies on the Conductor
    // ECR login having run in its dedicated step beforehand.
    // (When the profile is dropped from the compose file, this can fold into
    // the main `up` above.)
    onProgress(6, 'Starting Conductor services (conductor-postgres, conductor)...')
    const conductorUp = await sh(
      `direnv exec "${composeCwd}" ${composeCmd} up -d conductor-postgres conductor`,
      { cwd: composeCwd, interactive: true, env: { REPO_ROOT: REPO_PATH } }
    )
    if (conductorUp.code !== 0) {
      throw new Error('Failed to start Conductor services via docker compose.')
    }

    // 5. Wait for MySQL
    onProgress(6, 'Waiting for MySQL readiness...')
    const maxRetries = 10
    const retryInterval = 15
    let mysqlHealthy = false
    for (let i = 0; i < maxRetries; i++) {
      const containerId = await sh(
        `direnv exec "${composeCwd}" ${composeCmd} ps -q mysql 2>/dev/null || echo ""`,
        {
          cwd: composeCwd,
          env: { REPO_ROOT: REPO_PATH },
        }
      )
      const cid = containerId.stdout.trim()
      if (cid) {
        const health = await sh(
          `docker inspect --format='{{.State.Health.Status}}' ${cid} 2>/dev/null || echo "starting"`,
          { cwd: composeCwd }
        )
        if (health.stdout.trim() === 'healthy') {
          mysqlHealthy = true
          break
        }
      }
      onProgress(6, `Waiting for MySQL (${i + 1}/${maxRetries})...`)
      await new Promise((r) => setTimeout(r, retryInterval * 1000))
    }
    if (!mysqlHealthy) {
      throw new Error('MySQL did not become healthy in time.')
    }

    // 6. DB restore or create
    if (config.restoreDb) {
      onProgress(7, 'Restoring database from backup...')
      await sh(
        withRuntime(
          'bundle exec rails db:drop db:create db:seeds:restore db:migrate:with_data dev:enable_default_features db:test:prepare'
        ),
        { cwd: backendPath, interactive: true, check: true }
      )
    } else {
      onProgress(7, 'Creating database...')
      await sh(withRuntime('bundle exec rails db:create db:migrate db:test:prepare'), {
        cwd: backendPath,
        interactive: true,
        check: true,
      })
    }

    // 7. Verify post-conditions — only mark the task green if the environment is
    // actually usable. Each check is fail-loud (`check: true`) so a failure here
    // surfaces as a red task with a real error instead of a false ✓.
    onProgress(7, 'Verifying environment...')

    // 7a. The mysql2 native extension actually loads (zstd/openssl linked OK),
    //     not just that `gem install` reported success.
    await sh(withRuntime(`bundle exec ruby -e "require 'mysql2'"`), {
      cwd: backendPath,
      check: true,
    })

    // 7b. The database is reachable AND has no pending migrations. This single
    //     rake task must connect to read schema_migrations, so it covers both
    //     "DB exists/reachable" and "schema is up to date" in one Rails boot.
    await sh(withRuntime('bundle exec rails db:abort_if_pending_migrations'), {
      cwd: backendPath,
      check: true,
    })

    // 8. Done — no editor or browser opened; the finished pane shows next steps

    return { success: true, duration: Date.now() - start }
  } catch (e) {
    return {
      success: false,
      error: getErrorMessage(e),
      duration: Date.now() - start,
    }
  }
}
