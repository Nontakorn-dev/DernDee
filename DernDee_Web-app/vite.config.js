import path from 'node:path'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function isLoopbackAddress(remoteAddress = '') {
  return remoteAddress === '127.0.0.1'
    || remoteAddress === '::1'
    || remoteAddress === '::ffff:127.0.0.1'
}

async function readJsonBody(req) {
  const chunks = []

  for await (const chunk of req) {
    chunks.push(chunk)
  }

  const rawBody = Buffer.concat(chunks).toString('utf8')
  return rawBody ? JSON.parse(rawBody) : {}
}

async function findUserByEmail(adminClient, email) {
  let page = 1

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 200,
    })

    if (error) {
      throw error
    }

    const users = data?.users || []
    const matchedUser = users.find((user) => user.email?.toLowerCase() === email)

    if (matchedUser) {
      return matchedUser
    }

    if (users.length < 200) {
      return null
    }

    page += 1
  }
}

function localDevSupabaseAuth(env) {
  const bypassEnabled = env.VITE_SUPABASE_SKIP_EMAIL_CONFIRMATION === 'true'
  const supabaseUrl = env.VITE_SUPABASE_URL
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY

  if (!bypassEnabled || !supabaseUrl || !serviceRoleKey) {
    return {
      name: 'local-dev-supabase-auth-disabled',
    }
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return {
    name: 'local-dev-supabase-auth',
    configureServer(server) {
      server.middlewares.use('/__dev/supabase/local-signup', async (req, res, next) => {
        if (req.method !== 'POST') {
          next()
          return
        }

        if (!isLoopbackAddress(req.socket.remoteAddress)) {
          res.statusCode = 403
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Local signup helper is restricted to loopback requests.' }))
          return
        }

        try {
          const { email, password, metadata = {} } = await readJsonBody(req)
          const normalizedEmail = String(email || '').trim().toLowerCase()
          const normalizedPassword = String(password || '')

          if (!normalizedEmail || !normalizedPassword) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'email and password are required' }))
            return
          }

          const existingUser = await findUserByEmail(adminClient, normalizedEmail)
          let authUser = null
          let mode = 'created'

          if (existingUser && existingUser.email_confirmed_at) {
            res.statusCode = 409
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Account already exists. Use login instead.' }))
            return
          }

          if (existingUser) {
            const { data, error } = await adminClient.auth.admin.updateUserById(existingUser.id, {
              email_confirm: true,
              password: normalizedPassword,
              user_metadata: {
                ...(existingUser.user_metadata || {}),
                ...metadata,
              },
            })

            if (error) {
              throw error
            }

            authUser = data.user
            mode = 'activated'
          } else {
            const { data, error } = await adminClient.auth.admin.createUser({
              email: normalizedEmail,
              password: normalizedPassword,
              email_confirm: true,
              user_metadata: metadata,
            })

            if (error) {
              throw error
            }

            authUser = data.user
          }

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({
            mode,
            user: authUser
              ? {
                  id: authUser.id,
                  email: authUser.email,
                }
              : null,
          }))
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error.message || 'Local signup helper failed' }))
        }
      })
    },
  }
}

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
          || pathname.startsWith('/__dev/')
          || pathname.startsWith('/node_modules/')

        if (isViteInternalRequest) {
          next()
          return
        }

        if (pathname === '/clinic' || pathname === '/clinic/') {
          rewrite(req, '/apps/clinic/index.html')
        } else if (pathname === '/clinic/gait-dashboard' || pathname === '/clinic/gait-dashboard/') {
          rewrite(req, '/apps/patient/index.html')
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
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, '')

  return {
    plugins: [react(), localDevSupabaseAuth(env), appRouteAliases()],
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
        },
      },
    },
    assetsInclude: ['**/*.m4a', '**/*.mp3', '**/*.mp4'],
    server: {
      host: '0.0.0.0',
      port: 5174,
      open: true,
      fs: {
        allow: [path.resolve(__dirname, '..')],
      },
    },
  }
})
