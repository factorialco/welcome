#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Fail with an explanation rather than a loader crash on an unsupported runtime.
// This has to run before tsx is loaded, which is why tsx is imported dynamically
// below: static imports are evaluated before any statement in the module body.
const MIN_NODE_MAJOR = 24
const nodeMajor = Number.parseInt(process.versions.node.split('.')[0], 10)
if (!Number.isFinite(nodeMajor) || nodeMajor < MIN_NODE_MAJOR) {
  console.error(
    `\nThis wizard needs Node.js ${MIN_NODE_MAJOR} or newer (found ${process.version}).\n\n` +
      'Run the bootstrap installer instead, which installs Homebrew and Node.js for you:\n' +
      '  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/factorialco/welcome/v1/install.sh)"\n'
  )
  process.exit(1)
}

// tsx resolves tsconfig.json from the current working directory by default.
// When run via `npx` from an arbitrary directory, it won't find this package's
// tsconfig and falls back to the classic JSX transform (which needs `React` in
// scope), so the app dies with "React is not defined". Point tsx at our own
// tsconfig so the automatic JSX runtime ("jsx": "react-jsx") is always used.
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
process.env.TSX_TSCONFIG_PATH ??= join(packageRoot, 'tsconfig.json')

// Register tsx loader so we can import .tsx files directly
const { register } = await import('tsx/esm/api')
register()

// Now import and run the app
await import('../src/index.tsx')
