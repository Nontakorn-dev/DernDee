import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { loadTestModule } from './load-module.mjs'

const trail = await loadTestModule(`
  export * from '@trail/lib/progression.ts';
  export * from '@trail/lib/trailQuestCloud.ts';
`, {
  'shared/supabase/client.js': `
    export const isSupabaseConfigured = true;
    export const getSupabaseClient = () => globalThis.__trailTestClient;
  `,
})

let storage, cloud, writes, activeId, deferredRead
beforeEach(() => {
  storage = new Map()
  cloud = new Map()
  writes = []
  activeId = 'patient-a'
  deferredRead = null
  globalThis.window = {}
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
  }
  globalThis.__trailTestClient = {
    auth: { getSession: async () => ({ data: { session: activeId ? { user: { id: activeId } } : null } }) },
    from(table) {
      assert.equal(table, 'trail_quest_days')
      const filters = {}
      const query = {
        select() { return query },
        eq(key, value) { filters[key] = value; return query },
        async maybeSingle() {
          const data = cloud.get(`${filters.patient_id}:${filters.play_date}`) || null
          if (deferredRead) await deferredRead()
          return { data, error: null }
        },
        async upsert(row) {
          // Assert writes keep the captured owner, never the new logged-in ID.
          assert.equal(row.patient_id, activeId)
          writes.push(row)
          cloud.set(`${row.patient_id}:${row.play_date}`, row)
          return { error: null }
        },
      }
      return query
    },
  }
})

function save(score, completed = []) {
  return { ...trail.emptySave(), totalScore: score, completed }
}

test('different accounts keep separate local scores, unlocks, and cloud rows', async () => {
  await trail.writeSave('patient-a', save(100, ['dorsiflexor-1']))
  activeId = 'patient-b'
  assert.equal(trail.loadSave('patient-b').totalScore, 0)
  await trail.writeSave('patient-b', save(25, ['dorsiflexor-2']))
  assert.equal(trail.loadSave('patient-a').totalScore, 100)
  assert.deepEqual(trail.loadSave('patient-a').completed, ['dorsiflexor-1'])
  assert.equal(trail.loadSave('patient-b').totalScore, 25)
  activeId = 'patient-a'
  assert.equal((await trail.hydrateSave('patient-a')).totalScore, 100)
  assert.deepEqual(writes.map((row) => row.patient_id), ['patient-a', 'patient-b'])
})

test('ownerless legacy scores are not attributed to a user, but owned cloud progress returns', async () => {
  const legacy = JSON.stringify(save(9999, ['combined-3']))
  storage.set('derndee-save-v2', legacy)
  cloud.set(`patient-a:${trail.bangkokToday()}`, {
    play_date: trail.bangkokToday(), score: 80, completed: ['dorsiflexor-1'], clears: [],
  })
  assert.equal(trail.loadSave('patient-a').totalScore, 0)
  const hydrated = await trail.hydrateSave('patient-a')
  assert.equal(hydrated.totalScore, 80)
  assert.deepEqual(hydrated.completed, ['dorsiflexor-1'])
  assert.equal(storage.get('derndee-save-v2'), legacy)
  assert.equal(writes.length, 0)
})

test('an in-flight hydration cannot merge patient A into patient B after an account switch', async () => {
  await trail.writeSave('patient-a', save(100, ['dorsiflexor-1']))
  cloud.set(`patient-a:${trail.bangkokToday()}`, {
    play_date: trail.bangkokToday(), score: 50, completed: [], clears: [],
  })
  let release, entered
  const blocked = new Promise((resolve) => { release = resolve })
  const started = new Promise((resolve) => { entered = resolve })
  deferredRead = () => { entered(); return blocked }
  const hydration = trail.hydrateSave('patient-a')
  await started
  activeId = 'patient-b'
  await trail.writeSave('patient-b', save(20))
  release()
  await hydration
  assert.equal(trail.loadSave('patient-b').totalScore, 20)
  assert.equal(cloud.get(`patient-b:${trail.bangkokToday()}`).score, 20)
  assert.equal(trail.loadSave('patient-a').totalScore, 100)
})

test('delayed writes from a previous account stay local to that owner and do not use the new account', async () => {
  activeId = 'patient-b'
  await trail.writeSave('patient-a', save(300))
  assert.equal(trail.loadSave('patient-a').totalScore, 300)
  assert.equal(trail.loadSave('patient-b').totalScore, 0)
  assert.equal(writes.length, 0)
})

test('signed-out calls do not create a shared anonymous save', async () => {
  activeId = null
  await trail.writeSave(null, save(100))
  assert.equal((await trail.hydrateSave(null)).totalScore, 0)
  assert.equal(storage.size, 0)
  assert.equal(writes.length, 0)
})

test('a previous day does not replace or unlock today', async () => {
  const old = { ...save(999), playDate: '2000-01-01' }
  storage.set('derndee-save-v3:patient-a:2000-01-01', JSON.stringify(old))
  assert.equal(trail.loadSave('patient-a').totalScore, 0)
  await trail.writeSave('patient-a', old)
  assert.equal(writes.length, 0)
  assert.equal(storage.size, 1)
})
