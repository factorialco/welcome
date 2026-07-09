#!/usr/bin/env node
import { register } from 'tsx/esm/api'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// tsx resolves tsconfig.json from the current working directory by default.
// When run via `npx` from an arbitrary directory, it won't find this package's
// tsconfig and falls back to the classic JSX transform (which needs `React` in
// scope), so the app dies with "React is not defined". Point tsx at our own
// tsconfig so the automatic JSX runtime ("jsx": "react-jsx") is always used.
const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
process.env.TSX_TSCONFIG_PATH ??= join(packageRoot, 'tsconfig.json')

// Register tsx loader so we can import .tsx files directly
register()

// Now import and run the app
await import('../src/index.tsx')
