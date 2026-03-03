import React from 'react'
import { Box } from 'ink'
import { useWizard, WizardProvider } from './context.js'
import { Header } from './components/Header.js'
import { Footer } from './components/Footer.js'
import { WelcomeStep } from './steps/Welcome.js'
import { IdentityStep } from './steps/Identity.js'
import { ToolsStep } from './steps/Tools.js'
import { ServicesStep } from './steps/Services.js'
import { ReviewStep } from './steps/Review.js'
import { SSHSetupStep } from './steps/SSHSetup.js'
import { AWSSetupStep } from './steps/AWSSetup.js'
import { InstallStep } from './steps/Install.js'

function WizardContent() {
  const { currentStep } = useWizard()

  const steps = [
    <WelcomeStep key="welcome" />,
    <IdentityStep key="identity" />,
    <ToolsStep key="tools" />,
    <ServicesStep key="services" />,
    <ReviewStep key="review" />,
    <SSHSetupStep key="ssh-setup" />,
    <AWSSetupStep key="aws-setup" />,
    <InstallStep key="install" />
  ]

  return (
    <Box flexDirection="column" width="100%" paddingX={2} paddingY={2}>
      <Header />
      {steps[currentStep]}
      <Footer showBack={currentStep > 0 && currentStep < 5} />
    </Box>
  )
}

export default function App() {
  return (
    <WizardProvider>
      <WizardContent />
    </WizardProvider>
  )
}
