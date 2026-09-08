// Stable row IDs make a retry safe even if the previous response was lost.
async function metricId(sessionId, index) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${sessionId}:gait-metric:${index}`),
  )
  const bytes = new Uint8Array(digest).slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x80 // UUID v8 (application-defined hash)
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function syncFrontendSessionRecord(supabase, record, sessionRow) {
  const findSession = async () => {
    const { data, error } = await supabase.from('sessions')
      .select('id')
      .eq('gateway_session_id', record.gatewaySessionId)
      .eq('patient_id', record.patientId)
      .maybeSingle()
    if (error) throw error
    return data?.id || null
  }

  let sessionId = await findSession()
  if (!sessionId) {
    let response = await supabase.from('sessions').insert(sessionRow).select('id').single()
    const message = `${response.error?.message || ''} ${response.error?.details || ''}`.toLowerCase()
    if (response.error && message.includes('details') && /column|schema cache|pgrst/.test(message)) {
      const { details, ...legacyRow } = sessionRow
      response = await supabase.from('sessions').insert(legacyRow).select('id').single()
    }
    if (response.error?.code === '23505') {
      // Another tab may have inserted the same immutable outbox record.
      sessionId = await findSession()
    }
    if (response.error && !sessionId) throw response.error
    sessionId ||= response.data?.id
  }
  if (!sessionId) throw new Error('Session insert did not return an ID')

  const rows = record.gaitMetricsRows || []
  if (rows.length) {
    const { count, error } = await supabase.from('gait_metrics')
      .select('id', { count: 'exact', head: true }).eq('session_id', sessionId)
    if (error) throw error
    if (!Number.isInteger(count)) throw new Error('Could not verify saved gait metrics')

    // Older clients inserted all metrics in one atomic bulk request with random
    // IDs. Recognize a completed batch so those queued records recover too.
    if (count !== rows.length) {
      if (count !== 0) throw new Error('Saved gait metric count does not match the queued session')
      const metrics = await Promise.all(rows.map(async (row, index) => ({
        ...row,
        id: await metricId(sessionId, index),
        session_id: sessionId,
      })))
      const { error: metricsError } = await supabase.from('gait_metrics')
        .upsert(metrics, { onConflict: 'id', ignoreDuplicates: true })
      if (metricsError) throw metricsError
    }
  }

  return { sessionId, savedMetricsCount: rows.length, sessionRow }
}
