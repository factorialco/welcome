import { useApp, useInput } from 'ink'
import { useInstallRunner } from './install/useInstallRunner.js'
import { SudoGate } from './install/SudoGate.js'
import { CompletionScreen } from './install/CompletionScreen.js'
import { TaskList } from './install/TaskList.js'

export function InstallStep() {
  const { exit } = useApp()
  const { tasks, finished, totalDuration, sudoReady, percent, retryFailed } = useInstallRunner()

  // Keyboard handling on the completion screen
  useInput((input, key) => {
    if (!finished) return
    if (input === 'r' || input === 'R') retryFailed()
    if (key.return) exit()
  })

  if (!sudoReady) return <SudoGate />
  if (finished) return <CompletionScreen tasks={tasks} totalDuration={totalDuration} />
  return <TaskList tasks={tasks} percent={percent} />
}
