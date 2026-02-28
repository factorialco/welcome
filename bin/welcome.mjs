#!/usr/bin/env node
import { register } from 'tsx/esm/api'

// Register tsx loader so we can import .tsx files directly
register()

// Now import and run the app
await import('../src/index.tsx')
