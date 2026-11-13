import { type SetupConfig } from '../../context/index.js'
import type { VersionManager } from '../../context/types.js'
import { getLibBuildFlags, isDarwin, isLinux } from '../../platform.js'
import { BUNDLER_VERSION, PNPM_VERSION, REPO_PATH } from '../constants.js'
import {
  fileExists,
  getErrorMessage,
  makeShTool,
  shellEscape,
  sudoSh,
  type ProgressCallback,
  type TaskResult,
} from '../helpers.js'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

type ShTool = ReturnType<typeof makeShTool>

/**
 * Bundler version the backend's lockfile asks for. The pinned constant is only
 * a fallback: reading `BUNDLED WITH` keeps this working when the monorepo bumps
 * bundler ahead of the version pinned here.
 */
async function resolveBundlerVersion(backendCwd: string): Promise<string> {
  try {
    const lock = await readFile(path.join(backendCwd, 'Gemfile.lock'), 'utf-8')
    return /BUNDLED WITH\s+([\d.]+)/.exec(lock)?.[1] ?? BUNDLER_VERSION
  } catch {
    return BUNDLER_VERSION
  }
}

/**
 * Refuse to continue on an OS-bundled Ruby. Every gem and bundle command below
 * would otherwise appear to work and then fail several commands later inside
 * bundler, with a message that says nothing about PATH.
 */
async function assertManagedRuby(shTool: ShTool, versionManager: VersionManager): Promise<void> {
  const rubyPath = (await shTool('command -v ruby')).stdout.trim()
  const rubyVersion = (await shTool(`ruby -e 'print RUBY_VERSION'`)).stdout.trim()
  const major = Number(rubyVersion.split('.')[0])

  if (!rubyPath || !Number.isFinite(major) || major < 3) {
    const found = rubyPath ? `${rubyPath}${rubyVersion ? ` (${rubyVersion})` : ''}` : 'no ruby'
    throw new Error(
      `Ruby from ${versionManager} is not on PATH. Found: ${found}. ` +
        `Complete the version manager step first. Then make sure the ${versionManager} ` +
        `activation line is in your shell profile.`
    )
  }
}

/** Step 13: Setup development environment */
export async function runStep13(
  config: SetupConfig,
  onProgress: ProgressCallback
): Promise<TaskResult> {
  const start = Date.now()
  try {
    // Every command here needs the version manager's toolchain (ruby, node,
    // python) rather than whatever the login shell's PATH resolves to.
    // Default to the repo: both managers pick versions from the working
    // directory's .tool-versions, and outside the repo neither gives the repo's
    // Ruby. With mise, the global is step 5's `ruby@latest`, not the pinned one,
    // so a gem installed in the repo is missing when checked elsewhere. With
    // asdf, step 5 sets no global ruby, so `ruby` has no version at all. The
    // same applies to `npm` and the repo's Node.
    const baseShTool = makeShTool(config.versionManager)
    const shTool: ShTool = (command, options) =>
      baseShTool(command, { ...options, cwd: options?.cwd ?? REPO_PATH })
    const backendCwd = path.join(REPO_PATH, 'backend')
    const reshim = config.versionManager === 'mise' ? 'mise reshim || true' : 'asdf reshim || true'

    // Regenerate shims first: gem binstubs from an earlier partial run only
    // become callable after a reshim.
    await shTool(reshim)
    await assertManagedRuby(shTool, config.versionManager)

    // 0. Install yarn/pnpm and run pnpm i
    onProgress(0, 'Installing yarn and pnpm globally...')
    await shTool(`npm install --global yarn pnpm@${PNPM_VERSION}`, {
      interactive: true,
    })
    await shTool(reshim)

    onProgress(1, 'Running pnpm install...')
    await shTool('pnpm i', { cwd: REPO_PATH, interactive: true })

    // 1. Install bundler + bundle install
    onProgress(2, 'Installing bundler and running bundle install...')
    const bundlerVersion = await resolveBundlerVersion(backendCwd)
    // Same cwd as the install below, so this checks the gem dir of that Ruby.
    const gemDirWritable =
      (await shTool('[ -w "$(gem env gemdir)" ]', { cwd: backendCwd })).code === 0
    if (gemDirWritable) {
      await shTool(`gem install bundler -v "${bundlerVersion}"`, {
        cwd: backendCwd,
        check: true,
      })
    } else {
      // A system-owned gem dir needs root. Root's shell has no shims on PATH, so
      // a bare `gem` would be macOS's /usr/bin/gem. Adding the shims would not
      // help either: as root, $HOME and the mise/asdf config can differ, so the
      // shim could pick another Ruby. Resolve the active Ruby's `gem` here and
      // pass its absolute path to sudo.
      const gemPath = (
        await shTool(`ruby -e 'print File.join(RbConfig::CONFIG["bindir"], "gem")'`, {
          cwd: backendCwd,
        })
      ).stdout.trim()
      if (!gemPath || !(await fileExists(gemPath))) {
        throw new Error(
          `Could not find the gem command of the ${config.versionManager} Ruby` +
            `${gemPath ? ` (looked for ${gemPath})` : ''}.`
        )
      }
      // Fail loud on a bad exit code: a swallowed failure here comes back later
      // as a confusing bundler error.
      const sudoGem = await sudoSh(
        `${shellEscape(gemPath)} install bundler -v ${shellEscape(bundlerVersion)}`,
        { cwd: backendCwd }
      )
      if (sudoGem.code !== 0) {
        const tail = (sudoGem.stderr || sudoGem.stdout).split('\n').slice(-15).join('\n')
        throw new Error(
          `Failed to install bundler ${bundlerVersion} into the system gem dir (exit ${sudoGem.code})` +
            `${tail ? `\n${tail}` : ''}`
        )
      }
    }
    await shTool(reshim)
    await shTool(`gem list -i -v "${bundlerVersion}" bundler`, { cwd: backendCwd, check: true })
    await shTool('bundle --version', { cwd: backendCwd, check: true })

    // mysql2 gem with library flags (platform-aware)
    const buildFlags = await getLibBuildFlags((cmd) => shTool(cmd))

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
      // `--global` writes to ~/.bundle/config, so the working directory does not
      // change the outcome. Run it from the repo root: it has no Gemfile, so
      // bundler does not load backend/Gemfile.lock (which would turn any bundler
      // mismatch into a failure here), yet the version manager still picks the
      // repo's ruby from .tool-versions. From $HOME, mise would run its global
      // `ruby@latest` and asdf would have no ruby version to run.
      await shTool(
        `bundle config set --global build.mysql2 "--with-opt-dir=${buildFlags.optDir} --with-ldflags=${buildFlags.ldflags} --with-cppflags=${buildFlags.cppflags}"`,
        { cwd: REPO_PATH, check: true }
      )
    }

    await shTool(
      `gem install mysql2 -- --with-opt-dir="${buildFlags.optDir}" --with-ldflags="${buildFlags.ldflags}" --with-cppflags="${buildFlags.cppflags}"`,
      { cwd: backendCwd, env: buildEnv, check: true }
    )

    // tmuxinator (terminal multiplexer session manager)
    await shTool('gem install tmuxinator')
    await shTool(reshim)

    await shTool('bundle install', {
      cwd: backendCwd,
      interactive: true,
      env: buildEnv,
      check: true,
    })

    // 2. Mobile + ATS deps
    onProgress(3, 'Installing mobile and ATS dependencies...')
    await shTool('pnpm i', {
      cwd: path.join(REPO_PATH, 'mobile'),
      interactive: true,
    })
    await shTool('yarn install', {
      cwd: path.join(REPO_PATH, 'backend', 'components', 'ats'),
      interactive: true,
    })

    // 3. Shadowdog
    onProgress(4, 'Running shadowdog...')
    await shTool('pnpm shadowdog', { cwd: REPO_PATH, interactive: true })

    // 4. Docker compose — detect modern plugin vs legacy standalone
    const composeCmd = await (async () => {
      try {
        await shTool('docker compose version', { cwd: REPO_PATH, check: true })
        return 'docker compose'
      } catch {
        try {
          await shTool('docker-compose --version', { cwd: REPO_PATH, check: true })
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
    await shTool(`direnv exec "${composeCwd}" ${composeCmd} up -d --force-recreate`, {
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
    const conductorUp = await shTool(
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
      const containerId = await shTool(
        `direnv exec "${composeCwd}" ${composeCmd} ps -q mysql 2>/dev/null || echo ""`,
        {
          cwd: composeCwd,
          env: { REPO_ROOT: REPO_PATH },
        }
      )
      const cid = containerId.stdout.trim()
      if (cid) {
        const health = await shTool(
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

    // Rails reads DATABASE_HOST/PORT/PASSWORD and RAILS_ENV from the repo's
    // .envrc files. The wizard's shell never loads them (direnv only hooks the
    // interactive prompt), so without `direnv exec` Rails falls back to the
    // /tmp/mysql.sock socket and a `factorial_` database name.
    const rails = `direnv exec "${backendCwd}" bundle exec rails`

    // 6. DB restore or create
    if (config.restoreDb) {
      onProgress(7, 'Restoring database from backup...')
      await shTool(
        `${rails} db:drop db:create db:seeds:restore db:migrate:with_data dev:enable_default_features db:test:prepare`,
        { cwd: backendCwd, interactive: true, check: true }
      )
    } else {
      onProgress(7, 'Creating database...')
      await shTool(`${rails} db:create db:migrate db:test:prepare`, {
        cwd: backendCwd,
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
    await shTool(`bundle exec ruby -e "require 'mysql2'"`, { cwd: backendCwd, check: true })

    // 7b. The database is reachable AND has no pending migrations. This single
    //     rake task must connect to read schema_migrations, so it covers both
    //     "DB exists/reachable" and "schema is up to date" in one Rails boot.
    await shTool(`${rails} db:abort_if_pending_migrations`, {
      cwd: backendCwd,
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
