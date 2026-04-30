import path from 'node:path'
import fs from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function appRouteAliases() {
  const rewrite = (req, targetPath) => {
    const originalUrl = req.url || ''
    const queryIndex = originalUrl.indexOf('?')
    const query = queryIndex >= 0 ? originalUrl.slice(queryIndex) : ''
    req.url = `${targetPath}${query}`
  }

  const copyBuiltHtml = (from, to) => {
    const source = path.resolve(__dirname, 'dist', from)
    const target = path.resolve(__dirname, 'dist', to)

    if (!fs.existsSync(source)) {
      return
    }

    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(source, target)
  }

  return {
    name: 'app-route-aliases',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const pathname = (req.url || '').split('?')[0]
        const isStaticRequest = /\.[a-zA-Z0-9_-]+$/.test(pathname)
        const isViteInternalRequest = pathname.startsWith('/@')
          || pathname.startsWith('/__vite')
          || pathname.startsWith('/node_modules/')

        if (isViteInternalRequest) {
          next()
          return
        }

        if (pathname === '/clinic' || pathname === '/clinic/') {
          rewrite(req, '/apps/clinic/index.html')
        } else if (pathname === '/clinic/gait-dashboard' || pathname === '/clinic/gait-dashboard/') {
          rewrite(req, '/apps/clinic/gait-dashboard/index.html')
        } else if (pathname.startsWith('/clinic/gait-dashboard/')) {
          const dashboardAssetPath = pathname.replace('/clinic/gait-dashboard/', '')
          rewrite(req, `/apps/clinic/gait-dashboard/${dashboardAssetPath}`)
        } else if (pathname.startsWith('/clinic/')) {
          rewrite(req, '/apps/clinic/index.html')
        } else if (
          pathname === '/'
          || (!isStaticRequest
            && !pathname.startsWith('/apps/')
            && !pathname.startsWith('/shared/')
            && !pathname.startsWith('/assets/')
            && !pathname.startsWith('/audio/'))
        ) {
          rewrite(req, '/apps/patient/index.html')
        }

        next()
      })
    },
    closeBundle() {
      copyBuiltHtml('apps/patient/index.html', 'index.html')
      copyBuiltHtml('apps/clinic/index.html', 'clinic/index.html')
      copyBuiltHtml('apps/clinic/gait-dashboard/index.html', 'clinic/gait-dashboard/index.html')
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), appRouteAliases()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'shared'),
      '@patient': path.resolve(__dirname, 'apps/patient/src'),
      '@clinic': path.resolve(__dirname, 'apps/clinic/src'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        patient: path.resolve(__dirname, 'apps/patient/index.html'),
        clinic: path.resolve(__dirname, 'apps/clinic/index.html'),
        clinicGaitDashboard: path.resolve(__dirname, 'apps/clinic/gait-dashboard/index.html'),
      },
    },
  },
  assetsInclude: ['**/*.m4a', '**/*.mp3', '**/*.mp4'],  // Include audio and video files as assets
  server: {
    host: '0.0.0.0',
    port: 5174,
    open: true,
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
  }
})
