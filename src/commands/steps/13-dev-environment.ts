import { type SetupConfig } from '../../context/index.js'
import { getLibBuildFlags, isDarwin, isLinux } from '../../platform.js'
import { BUNDLER_VERSION, PNPM_VERSION, REPO_PATH } from '../constants.js'
import { getErrorMessage, sh, sudoSh, type ProgressCallback, type TaskResult } from '../helpers.js'
import path from 'node:path'

/** Step 13: Setup development environment */
export async function runStep13(
  config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    // 0. Install yarn/pnpm and run pnpm i
    onProgress(0, 'Installing yarn and pnpm globally...')
    await sh(`npm install --global yarn pnpm@${PNPM_VERSION}`, {
      interactive: true,
    })

    onProgress(1, 'Running pnpm install...')
    await sh('pnpm i', { cwd: REPO_PATH, interactive: true })

    // 1. Install bundler + bundle install
    onProgress(2, 'Installing bundler and running bundle install...')
    const gemPath = (await sh('command -v gem')).stdout
    const isUserGem = gemPath.includes(process.env.USER || '')
    if (isUserGem) {
      await sh(`gem install bundler -v "${BUNDLER_VERSION}"`, {
        cwd: path.join(REPO_PATH, 'backend'),
      })
    } else {
      // System gem requires elevated privileges
      await sudoSh(`gem install bundler -v '${BUNDLER_VERSION}'`)
    }

    // mysql2 gem with library flags (platform-aware)
    const buildFlags = await getLibBuildFlags((cmd) => sh(cmd))

    // Bundle config for native gem compilation — set before any gem install so
    // both the standalone gem install and bundle install pick up the right flags.
    // Needed on all macOS (not just ARM) with MySQL 9.x which requires zstd.
    if (isDarwin() || isLinux()) {
      await sh(
        `bundle config set --global build.mysql2 "--with-opt-dir=${buildFlags.optDir} --with-ldflags=${buildFlags.ldflags} --with-cppflags=${buildFlags.cppflags}"`,
        { cwd: path.join(REPO_PATH, 'backend') }
      )
    }

    await sh(
      `gem install mysql2 -- --with-opt-dir="${buildFlags.optDir}" --with-ldflags="${buildFlags.ldflags}" --with-cppflags="${buildFlags.cppflags}"`,
      { cwd: path.join(REPO_PATH, 'backend') }
    )

    // tmuxinator (terminal multiplexer session manager)
    await sh('gem install tmuxinator')

    await sh('bundle install', {
      cwd: path.join(REPO_PATH, 'backend'),
      interactive: true,
    })

    // 2. Mobile + ATS deps
    onProgress(3, 'Installing mobile and ATS dependencies...')
    await sh('pnpm i', {
      cwd: path.join(REPO_PATH, 'mobile'),
      interactive: true,
    })
    await sh('yarn install', {
      cwd: path.join(REPO_PATH, 'backend', 'components', 'ats'),
      interactive: true,
    })

    // 3. Shadowdog
    onProgress(4, 'Running shadowdog...')
    await sh('pnpm shadowdog', { cwd: REPO_PATH, interactive: true })

    // 4. Docker compose — detect modern plugin vs legacy standalone
    const composeCmd = await (async () => {
      try {
        await sh('docker compose version', { cwd: REPO_PATH })
        return 'docker compose'
      } catch {
        try {
          await sh('docker-compose --version', { cwd: REPO_PATH })
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
        'bundle exec rails db:drop db:create db:seeds:restore db:migrate:with_data dev:enable_default_features db:test:prepare',
        { cwd: path.join(REPO_PATH, 'backend'), interactive: true }
      )
    } else {
      onProgress(7, 'Creating database...')
      await sh('bundle exec rails db:create db:migrate db:test:prepare', {
        cwd: path.join(REPO_PATH, 'backend'),
        interactive: true,
      })
    }

    // 7. Done — no editor or browser opened; the finished pane shows next steps

    return { success: true, duration: Date.now() - start }
  } catch (e) {
    return {
      success: false,
      error: getErrorMessage(e),
      duration: Date.now() - start,
    }
  }
}
