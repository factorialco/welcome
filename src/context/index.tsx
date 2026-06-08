import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react'
import { runPreflightChecks, type PreflightResult } from '../commands/index.js'
import { DEFAULT_CONFIG, WIZARD_STEPS } from './setup.js'
import { getIdentityFromSystem, saveConfigToDisk, clearSavedConfig } from './helpers.js'
import type { SetupConfig, SavedState, WizardContextType } from './types.js'

// Re-export the split modules so existing `context` imports keep working.
export * from './types.js'
export * from './setup.js'
export * from './helpers.js'

// ── Context ────────────────────────────────────────────
const WizardContext = createContext<WizardContextType>(null!)

export function useWizard() {
  return useContext(WizardContext)
}

export function WizardProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SetupConfig>(() => {
    const identity = getIdentityFromSystem()
    return { ...DEFAULT_CONFIG, ...identity }
  })
  const [currentStep, setCurrentStep] = useState(0)
  const [returnToStep, setReturnToStep] = useState<number | null>(null)
  const totalSteps = WIZARD_STEPS.length

  // Pre-flight checks state
  const [preflightResults, setPreflightResults] = useState<PreflightResult[]>([])
  const [preflightDone, setPreflightDone] = useState(false)
  const [preflightHasBlocker, setPreflightHasBlocker] = useState(false)

  const runPreflight = useCallback(() => {
    setPreflightResults([])
    setPreflightDone(false)
    setPreflightHasBlocker(false)

    runPreflightChecks((result) => {
      setPreflightResults((prev) => [...prev, result])
    }).then((allResults) => {
      setPreflightDone(true)
      setPreflightHasBlocker(allResults.some((r) => r.status === 'fail'))
    })
  }, [])

  // Debounced auto-save: persist config + step to disk whenever they change.
  // The effect closes over the latest config/currentStep (they're in its deps),
  // so no refs are needed to read current values inside the timeout.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Don't save while on Welcome screen (step 0) — nothing to resume yet
    if (currentStep === 0) return

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveConfigToDisk(config, currentStep)
    }, 100)

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [config, currentStep])

  const updateConfig = (partial: Partial<SetupConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }))
  }

  const goNext = () => setCurrentStep((s) => Math.min(s + 1, totalSteps - 1))
  const goBack = () => setCurrentStep((s) => Math.max(s - 1, 0))
  const goToStep = (step: number) => setCurrentStep(step)

  const goToStepAndReturn = (step: number) => {
    setReturnToStep(currentStep)
    setCurrentStep(step)
  }

  const completeReturn = () => {
    if (returnToStep !== null) {
      setCurrentStep(returnToStep)
      setReturnToStep(null)
    }
  }

  const restoreSession = (saved: SavedState) => {
    setConfig(saved.config)
    setCurrentStep(saved.currentStep)
  }

  return (
    <WizardContext.Provider
      value={{
        config,
        updateConfig,
        currentStep,
        goNext,
        goBack,
        goToStep,
        goToStepAndReturn,
        returnToStep,
        completeReturn,
        totalSteps,
        restoreSession,
        clearSavedConfig,
        preflightResults,
        preflightDone,
        preflightHasBlocker,
        runPreflight,
      }}
    >
      {children}
    </WizardContext.Provider>
  )
}
