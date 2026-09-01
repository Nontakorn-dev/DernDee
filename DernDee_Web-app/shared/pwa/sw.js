import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'

self.skipWaiting()
clientsClaim()
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

async function resolveShell(shellPath) {
  try {
    const fresh = await fetch(shellPath, {
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (fresh.ok) {
      return fresh
    }
  } catch {
    // fall through to the precached shell
  }

  const cachedShell = await matchPrecache(shellPath)
  if (cachedShell) {
    return cachedShell
  }

  return fetch(shellPath, { credentials: 'same-origin' })
}

registerRoute(new NavigationRoute(() => resolveShell('/apps/clinic/index.html'), {
  allowlist: [/^\/clinic(?:\/.*)?$/],
}))

registerRoute(new NavigationRoute(() => resolveShell('/apps/patient/index.html'), {
  denylist: [/^\/clinic(?:\/.*)?$/, /^\/api(?:\/.*)?$/],
}))