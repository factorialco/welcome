import { useApp, useInput } from 'ink'
import { useWizard } from '../context/index.js'
import { deferOnboardingLaunch } from '../commands/index.js'
import { useInstallRunner } from './install/useInstallRunner.js'
import { SudoGate } from './install/SudoGate.js'
import { CompletionScreen } from './install/CompletionScreen.js'
import { TaskList } from './install/TaskList.js'

export function InstallStep() {
  const { exit } = useApp()
  const { config } = useWizard()
  const { tasks, finished, totalDuration, sudoReady, percent, retryFailed } = useInstallRunner()

  const willOnboard = !tasks.some((t) => t.status === 'failed') && config.agenticClis.length > 0

  // Keyboard handling on the completion screen
  useInput((input, key) => {
    if (!finished) return
    if (input === 'r' || input === 'R') retryFailed()
    if (input === 'q' || input === 'Q') exit()
    if (key.return) {
      if (willOnboard) deferOnboardingLaunch(config)
      exit()
    }
  })

  if (!sudoReady) return <SudoGate />
  if (finished) return <CompletionScreen tasks={tasks} totalDuration={totalDuration} />
  return <TaskList tasks={tasks} percent={percent} />
}
