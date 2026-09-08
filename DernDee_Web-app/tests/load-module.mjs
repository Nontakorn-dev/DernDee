import { build } from 'vite'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))

// Use the application's TypeScript/alias compiler, replacing only external
// service boundaries. No environment file, network or production data is used.
export async function loadTestModule(entry, mocks = {}) {
  const result = await build({
    configFile: false,
    envFile: false,
    root,
    logLevel: 'silent',
    resolve: { alias: { '@trail': `${root}apps/patient/src/trail-quest`, '@shared': `${root}shared` } },
    plugins: [{
      name: 'regression-test-boundaries',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'regression-entry' || id.endsWith('/regression-entry')) return '\0regression-entry'
        const key = Object.keys(mocks).find((suffix) => id.endsWith(suffix))
        if (key) return `\0mock:${key}`
      },
      load(id) {
        if (id === '\0regression-entry') return entry
        if (id.startsWith('\0mock:')) return mocks[id.slice(6)]
      },
    }],
    build: {
      write: false, minify: false,
      lib: { entry: 'regression-entry', formats: ['es'] },
      rollupOptions: { output: { inlineDynamicImports: true } },
    },
  })
  const output = Array.isArray(result) ? result[0].output : result.output
  const code = output.find((item) => item.type === 'chunk' && item.isEntry).code
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)
}
