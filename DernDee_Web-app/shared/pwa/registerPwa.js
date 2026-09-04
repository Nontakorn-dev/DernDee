import { registerSW } from 'virtual:pwa-register'

export function registerDernDeePwa() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {}
  }

  const updateSW = registerSW({
    immediate: true,
    onOfflineReady() {
      console.info('StepDee is ready for offline use.')
    },
    onNeedRefresh() {
      void updateSW(true)
    },
  })

  return updateSW
}