#!/usr/bin/env node

// Pre-bootstrap Node version gate: fail fast with a clear message before
// loading tsx/Ink, which would otherwise crash cryptically on an old Node.
const MIN_NODE_MAJOR = 18
const major = Number(process.versions.node.split('.')[0])
if (Number.isNaN(major) || major < MIN_NODE_MAJOR) {
  console.error(
    `\nFactorial welcome needs Node.js >= ${MIN_NODE_MAJOR} (you have ${process.versions.node}).`
  )
  console.error('Install a newer Node (https://nodejs.org or `brew install node`) and re-run.\n')
  process.exit(1)
}

// Dynamic imports run after the gate (static imports would hoist above it).
const { register } = await import('tsx/esm/api')
register()
await import('../src/index.tsx')
