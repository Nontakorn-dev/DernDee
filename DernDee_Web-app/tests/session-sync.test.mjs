import assert from 'node:assert/strict'
import { test } from 'node:test'
import { syncFrontendSessionRecord } from '../shared/services/frontendSessionSync.js'
import { loadTestModule } from './load-module.mjs'

function fakeDatabase() {
  const state = { sessions: [], metrics: [], failMetrics: false, loseSessionResponse: false, loseMetricResponse: false }
  const client = {
    from(table) {
      let action = 'read'
      let payload
      let options
      const filters = []
      const execute = async () => {
        const rows = table === 'sessions' ? state.sessions : state.metrics
        if (action === 'insert') {
          if (rows.some((row) => row.gateway_session_id === payload.gateway_session_id)) {
            return { error: { code: '23505', message: 'duplicate gateway_session_id' } }
          }
          const row = { ...payload, id: `session-${rows.length + 1}` }
          rows.push(row)
          if (state.loseSessionResponse) {
            state.loseSessionResponse = false
            return { error: { message: 'response lost after commit' } }
          }
          return { data: { id: row.id } }
        }
        if (action === 'upsert') {
          assert.deepEqual(options, { onConflict: 'id', ignoreDuplicates: true })
          if (state.failMetrics) {
            state.failMetrics = false
            return { error: { message: 'metrics request failed' } }
          }
          for (const row of payload) {
            assert.match(row.id, /^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
            if (!rows.some((saved) => saved.id === row.id)) rows.push(row)
          }
          if (state.loseMetricResponse) {
            state.loseMetricResponse = false
            return { error: { message: 'response lost after metrics commit' } }
          }
          return { error: null }
        }
        const selected = rows.filter((row) => filters.every(([key, value]) => row[key] === value))
        return options?.head
          ? { count: selected.length, error: null }
          : { data: selected[0] ? { id: selected[0].id } : null, error: null }
      }
      const query = {
        select(_columns, selectOptions) { if (action === 'read') options = selectOptions; return query },
        eq(key, value) { filters.push([key, value]); return query },
        insert(row) { action = 'insert'; payload = row; return query },
        upsert(rows, upsertOptions) { action = 'upsert'; payload = rows; options = upsertOptions; return query },
        single: execute,
        maybeSingle: execute,
        then(resolve, reject) { return execute().then(resolve, reject) },
      }
      return query
    },
  }
  return { state, client }
}

const record = {
  patientId: 'patient-a', gatewaySessionId: 'frontend-stable-id',
  gaitMetricsRows: [
    { side: 'left', step_index: 1, step_length_m: 0.3 },
    { side: 'right', step_index: 1, step_length_m: 0.4 },
  ],
}
const sessionRow = { patient_id: record.patientId, gateway_session_id: record.gatewaySessionId, details: {} }

for (const failure of ['failMetrics', 'loseSessionResponse', 'loseMetricResponse']) {
  test(`retry recovers ${failure} without duplicating a session or metrics`, async () => {
    const { state, client } = fakeDatabase()
    state[failure] = true
    await assert.rejects(syncFrontendSessionRecord(client, record, sessionRow))
    const result = await syncFrontendSessionRecord(client, record, sessionRow)
    assert.equal(result.savedMetricsCount, 2)
    assert.equal(state.sessions.length, 1)
    assert.equal(state.metrics.length, 2)
    await syncFrontendSessionRecord(client, record, sessionRow)
    assert.equal(state.metrics.length, 2)
  })
}

test('concurrent tabs converge on one parent and one immutable metric batch', async () => {
  const { state, client } = fakeDatabase()
  const results = await Promise.all([
    syncFrontendSessionRecord(client, record, sessionRow),
    syncFrontendSessionRecord(client, record, sessionRow),
  ])
  assert.equal(results[0].sessionId, results[1].sessionId)
  assert.equal(state.sessions.length, 1)
  assert.equal(state.metrics.length, 2)
})

test('old completed metric batches with random IDs are recognized and review data is preserved', async () => {
  const { state, client } = fakeDatabase()
  state.sessions.push({ ...sessionRow, id: 'existing', status: 'approved', review_notes: 'keep' })
  state.metrics.push(...record.gaitMetricsRows.map((row, i) => ({ ...row, id: `old-${i}`, session_id: 'existing' })))
  const result = await syncFrontendSessionRecord(client, record, sessionRow)
  assert.equal(result.sessionId, 'existing')
  assert.equal(state.metrics.length, 2)
  assert.equal(state.sessions[0].status, 'approved')
  assert.equal(state.sessions[0].review_notes, 'keep')
})

test('an inconsistent existing batch is reported instead of silently losing queued rows', async () => {
  const { state, client } = fakeDatabase()
  state.sessions.push({ ...sessionRow, id: 'existing' })
  state.metrics.push({ id: 'legacy-partial', session_id: 'existing' })
  await assert.rejects(syncFrontendSessionRecord(client, record, sessionRow), /count does not match/)
  assert.equal(state.metrics.length, 1)
})

test('a conflicting key belonging to a different patient cannot complete this record', async () => {
  const { state, client } = fakeDatabase()
  state.sessions.push({ ...sessionRow, patient_id: 'patient-b', id: 'other' })
  await assert.rejects(syncFrontendSessionRecord(client, record, sessionRow), { code: '23505' })
  assert.equal(state.metrics.length, 0)
})

test('the real persistence/outbox flow queues a partial failure, retries it, and removes the record', async () => {
  const { state, client } = fakeDatabase()
  const queue = new Map()
  globalThis.__sessionTestClient = client
  globalThis.__sessionTestQueue = queue
  const service = await loadTestModule(`export * from '@shared/services/sessionService.js';`, {
    'shared/supabase/client.js': `export const getSupabaseClient = () => globalThis.__sessionTestClient;`,
    'sessionOutbox.js': `
      const queue = globalThis.__sessionTestQueue;
      export const countPendingSessions = async () => queue.size;
      export const enqueuePendingSession = async (record) => { queue.set(record.id, record); return true; };
      export const isPendingSessionOutboxSupported = () => true;
      export const listPendingSessions = async () => [...queue.values()];
      export const removePendingSession = async (id) => queue.delete(id);
      export const updatePendingSessionSyncState = async (id, update) => {
        if (queue.has(id)) queue.set(id, { ...queue.get(id), ...update });
      };
    `,
  })
  state.failMetrics = true
  const result = await service.persistSessionFromFrontend({
    patientId: record.patientId,
    gatewaySessionId: record.gatewaySessionId,
    sessionType: 'free_walk',
    gaitMetricsRows: record.gaitMetricsRows,
    startedAt: '2026-09-08T00:00:00Z',
    endedAt: '2026-09-08T00:05:00Z',
    summary: { duration_seconds: 12, total_steps: 2 },
  })
  assert.equal(result.syncStatus, 'queued')
  assert.equal(queue.size, 1)
  assert.equal(state.sessions.length, 1)
  assert.equal(state.sessions[0].duration_seconds, 12, 'persist active time, excluding pauses')
  const [first, second] = await Promise.all([
    service.flushPendingFrontendSessions(), service.flushPendingFrontendSessions(),
  ])
  assert.equal(first.failedCount, 0)
  assert.equal(second.failedCount, 0)
  assert.equal(queue.size, 0)
  assert.equal(state.sessions.length, 1)
  assert.equal(state.metrics.length, 2)
})
