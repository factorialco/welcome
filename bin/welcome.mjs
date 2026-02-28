#!/usr/bin/env node
import { register } from 'node:module'
import { pathToFileURL } from 'node:url'

// Register tsx loader so we can import .tsx files directly
register('tsx/esm', pathToFileURL('./'))

// Now import and run the app
await import('../src/index.tsx')
