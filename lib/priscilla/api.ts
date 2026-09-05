import { allActions, chatReply, clientActions, clientInsight, rankActions, sourceDate, summarise, welcome, type AgentContext, type PriscillaRecommendation } from './engine'
import { snapshot } from '../wealth-model'
import { clientLinksFor } from './client-links'
import { priscillaStore, type PriscillaDB } from './store'
import { startDecisionTrace } from '../observability'
import { replyEvidence } from './evidence'
import { readTrace, saveTrace } from './trace-store'
import { configuredModel, reviewWithModel, type ModelEnvironment } from './live-model'

type Context = { waitUntil(promise: Promise<unknown>): void }
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } })

export async function handlePriscilla(request: Request, db: PriscillaDB | undefined, execution: Context, preview = false, modelEnv: ModelEnvironment = {}): Promise<Response | null> {
  const url = new URL(request.url), path = url.pathname
  const feedbackRoute = path.match(/^\/recommendations\/([^/]+)\/feedback$/)
  const insightRoute = path.match(/^\/clients\/(CL-\d{4})\/insight$/)
  const scanRoute = path.match(/^\/api\/agent\/scan\/([a-zA-Z0-9-]+)$/)
  const traceRoute = path.match(/^\/api\/agent\/trace\/([a-f0-9]{32})$/)
  if (path !== '/recommendations' && path !== '/api/agent' && !feedbackRoute && !insightRoute && !scanRoute && !traceRoute) return null
  // Hosted requests use the platform identity. The preview fixture is compile-time development only.
  const userId = request.headers.get('oai-authenticated-user-id') || (preview ? 'development-preview-rm' : '')
  if (!userId) return json({ error: 'Sign in to use Priscilla. Your existing client workbench remains available.' }, 401)
  if (request.method !== 'GET' && request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  if (request.method === 'POST' && (request.headers.get('sec-fetch-site') === 'cross-site' || (request.headers.get('origin') && request.headers.get('origin') !== url.origin))) return json({ error: 'Use Priscilla from this website.' }, 403)
  try {
    const store = priscillaStore(db, userId)
    if (request.method === 'GET') {
      if (traceRoute) {
        const trace = await readTrace(db, userId, traceRoute[1])
        return trace ? json({ trace }) : json({ error: 'Trace not found or expired.' }, 404)
      }
      if (insightRoute) {
        if (!snapshot.clients.some(c => c.id === insightRoute[1])) return json({ error: 'Client not found.' }, 404)
        return json({ insight: clientInsight(insightRoute[1]), grounding: [`clients.csv: ${insightRoute[1]}`, `holdings.csv: ${sourceDate}`, 'mandates.csv', 'credit_facilities.csv', 'rm_notes.json'] })
      }
      if (scanRoute) {
        const scan = await store.scan()
        if (!scan || scan.job_id !== scanRoute[1]) return json({ error: 'Scan not found.' }, 404)
        if (scan.status === 'running') return json({ type: 'scan_running', job_id: scan.job_id })
        if (scan.status === 'failed') return json({ error: 'The scan did not complete. Please retry.' }, 503)
        return json(JSON.parse(scan.result!))
      }
      if (path === '/api/agent') {
        await store.feedback()
        return json({ type: 'agent_welcome', message: welcome, transport: 'post', mode: 'grounded-rules', model: { provider: 'openai', model: configuredModel(modelEnv), configured: Boolean(modelEnv.OPENAI_API_KEY?.trim()), verified: false }, source_date: sourceDate })
      }
      if (path === '/recommendations') {
        const recommendations = rankActions(allActions(), await store.feedback())
        return json({ recommendations, summary: summarise(recommendations), source_date: sourceDate })
      }
      return json({ error: 'Method not allowed.' }, 405)
    }
    if (!request.headers.get('content-type')?.includes('application/json')) return json({ error: 'Send a JSON request.' }, 415)
    if (Number(request.headers.get('content-length') || 0) > 10000) return json({ error: 'Request is too long.' }, 413)
    const bodyText = await request.text()
    if (bodyText.length > 10000) return json({ error: 'Request is too long.' }, 413)
    let body: Record<string, unknown>
    try { body = JSON.parse(bodyText); if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error() } catch { return json({ error: 'Request could not be read.' }, 400) }
    if (feedbackRoute) {
      if (body.action !== 'accepted' && body.action !== 'dismissed') return json({ error: 'Choose accepted or dismissed.' }, 400)
      const raw = allActions(), action = raw.find(r => r.id === feedbackRoute[1])
      if (!action) return json({ error: 'Recommendation not found in this snapshot.' }, 404)
      await store.saveFeedback(action.id, action.kind, body.action)
      const recommendations = rankActions(raw, await store.feedback())
      return json({ recommendations, summary: summarise(recommendations), feedback: { id: action.id, action: body.action } })
    }
    if (path !== '/api/agent') return json({ error: 'Method not allowed.' }, 405)
    if (body.type === 'ping') { await store.feedback(); return json({ type: 'pong' }) }
    if (body.type === 'scan') {
      const jobId = crypto.randomUUID(), scan = await store.startScan(jobId)
      if (!scan) return json({ error: 'Could not start the scan.' }, 503)
      if (scan.job_id === jobId) execution.waitUntil((async () => {
        const telemetry = startDecisionTrace('agent.intelligence_scan', 'server')
        try {
          const raw: PriscillaRecommendation[] = []
          for (const client of snapshot.clients) {
            raw.push(...telemetry.run('rules.evaluate_client', () => clientActions(client.id), { 'groundwork.client_id': client.id, 'groundwork.source_date': sourceDate }))
            // Yield between clients; request handlers remain available during the background scan.
            await new Promise<void>(resolve => setTimeout(resolve, 0))
          }
          const feedback = await telemetry.runAsync('data.read_rm_feedback', () => store.feedback())
          const recommendations = telemetry.run('rules.rank_actions', () => rankActions(raw, feedback)), summary = summarise(recommendations)
          telemetry.event('llm.not_needed', { 'groundwork.llm.called': false })
          const evidence = replyEvidence({ action_ids: recommendations.slice(0, 4).map(r => r.id) }, recommendations)
          const trace = await saveTrace(db, userId, await telemetry.finish(evidence))
          await store.finishScan(jobId, 'complete', { type: 'scan_results', message: `Scan complete. ${recommendations.length} items on the board; ${summary.urgent} need priority review in the supplied snapshot. Open a priority client below, or ask for the briefing.`, client_links: clientLinksFor(recommendations.slice(0, 4).map(r => r.client_id)), summary, source_date: sourceDate, trace })
        } catch { await saveTrace(db, userId, await telemetry.finish(undefined, true)).catch(() => {}); await store.finishScan(jobId, 'failed', { error: 'Scan unavailable' }).catch(() => {}) }
      })())
      return json({ type: 'scan_started', job_id: scan.job_id }, 202)
    }
    if (body.type === 'chat') {
      if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 1500) return json({ error: 'Enter a message from 1 to 1500 characters.' }, 400)
      const supplied = body.context as AgentContext | undefined
      const context: AgentContext = { client_id: typeof supplied?.client_id === 'string' ? supplied.client_id : null, briefing_scope: supplied?.briefing_scope === 'book' ? 'book' : 'client' }
      if (context.client_id && !snapshot.clients.some(c => c.id === context.client_id)) return json({ error: 'Client context not found. Open a client file again.' }, 400)
      const telemetry = startDecisionTrace('agent.reply', 'server')
      try {
        const clients = telemetry.run('data.read_snapshot', () => snapshot.clients, { 'groundwork.source_date': sourceDate, 'groundwork.source': 'wealth-snapshot.json', 'groundwork.client_count': snapshot.clients.length })
        const raw = clients.flatMap(client => telemetry.run('rules.evaluate_client', () => clientActions(client.id), { 'groundwork.client_id': client.id }))
        const feedback = await telemetry.runAsync('data.read_rm_feedback', () => store.feedback())
        const ranked = telemetry.run('rules.rank_actions', () => rankActions(raw, feedback), { 'groundwork.feedback_count': feedback.length })
        const reply = telemetry.run('agent.select_operation_and_reply', () => chatReply((body.message as string).trim(), context, ranked))
        const evidence = telemetry.run('evidence.bind_sources', () => replyEvidence(reply, ranked))
        telemetry.run('evidence.validate_client_references', () => {
          if (reply.client_links?.some(link => !clients.some(client => client.id === link.client_id))) throw new Error('Unknown source reference')
          telemetry.event('evidence.references_checked', { 'groundwork.client_references': reply.client_links?.length || 0, 'groundwork.checks.failed': evidence.checks.filter(c => c.status === 'fail').length })
        })
        await reviewWithModel({ env: modelEnv, evidence, message: body.message, telemetry, signal: request.signal, eligible: Boolean(reply.evidence || reply.action_ids?.length) })
        const trace = await saveTrace(db, userId, await telemetry.finish(evidence))
        return json({ ...reply, trace })
      } catch {
        await saveTrace(db, userId, await telemetry.finish(undefined, true)).catch(() => {})
        return json({ error: 'Priscilla could not complete the reply. Please retry.' }, 503)
      }
    }
    return json({ error: 'Unknown Priscilla request.' }, 400)
  } catch {
    return json({ error: 'Priscilla is temporarily unavailable. Your existing workbench is unchanged. Please retry.' }, 503)
  }
}
