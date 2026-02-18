import { driver, DriveStep } from 'driver.js'
import { useAppSettings } from '@renderer/store/settings'
import { storeToRefs } from 'pinia'

export function useTour(tourId: 'dashboard' | 'editor') {
  const settingsStore = useAppSettings()
  const { settings } = storeToRefs(settingsStore)
  const { updateSettings } = settingsStore

  const startTour = (steps: DriveStep[], force = false) => {
    const d = driver({
      showProgress: true,
      steps: steps,
      onHighlighted: (element, step, { state }) => {
        const tours = { ...settings.value.tours }
        tours[tourId] = {
          step: state.activeIndex,
          completed: state.activeIndex === steps.length - 1
        }

        updateSettings({
          ...settings.value,
          tours
        })
      }
    })

    const currentStep = settings.value.tours[tourId]?.step ?? 0
    d.drive(force ? 0 : currentStep)
  }

  return {
    startTour,
    isCompleted: () => settings.value.tours[tourId]?.completed ?? false
  }
}
