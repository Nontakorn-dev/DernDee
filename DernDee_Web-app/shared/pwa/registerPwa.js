import { registerSW } from 'virtual:pwa-register'

export function registerDernDeePwa() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {}
  }

  return registerSW({
    immediate: true,
    onOfflineReady() {
      console.info('DernDee is ready for offline use.')
    },
    onNeedRefresh() {
      console.info('A new DernDee version is available. Reload to update.')
    },
  })
}