import { render } from 'ink'
import App from './App.js'
import { launchDeferredOnboarding } from './commands/index.js'

const LOG_FILE = '/tmp/welcome.log'

process.on('uncaughtException', (err) => {
  console.error(`\n\nFatal error: ${err.message}`)
  console.error(`Check ${LOG_FILE} for details.\n`)
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason)
  console.error(`\n\nUnhandled error: ${msg}`)
  console.error(`Check ${LOG_FILE} for details.\n`)
  process.exit(1)
})

const { waitUntilExit } = render(<App />)

waitUntilExit().then(() => launchDeferredOnboarding())
