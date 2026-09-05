import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { build } from 'esbuild'

async function source(path) {
  const compiled = await build({ entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', write: false, banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(process.cwd() + '/package.json');" } })
  try { return await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')) } catch (e) { throw new Error(`Module load: ${e.message}`) }
}
const [llm, contract, otel, proofs, wealth, api, diagrams] = await Promise.all(['../lib/priscilla/live-model.ts', '../lib/priscilla/model-contract.ts', '../lib/observability.ts', '../lib/calculation-evidence.ts', '../lib/wealth-model.ts', '../lib/priscilla/api.ts', '../lib/evidence-diagram.ts'].map(source))
const evidence = proofs.interestEvidence(wealth.wealthFor('CL-0002'))
const env = { OPENAI_API_KEY: 'test-only-secret-not-a-real-key', OPENAI_MODEL: contract.defaultModel }
const result = (selection = { status: 'supported', evidence_ids: ['result', 'working_0'] }, overrides = {}) => Response.json({ id: 'resp_test', model: 'gpt-5.6-luna', status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(selection) }] }], usage: { input_tokens: 456, output_tokens: 23 }, ...overrides }, { headers: { 'x-request-id': 'req_test' } })
async function review(fetcher, extra = {}) {
  const telemetry = otel.startDecisionTrace('agent.reply', 'server')
  const model = await llm.reviewWithModel({ env, evidence, message: 'Secret RM prompt: explain Ravi interest', telemetry, fetcher, ...extra })
  const trace = await telemetry.finish(evidence)
  return { model, trace, telemetry }
}

test('accepted model selection traces a real awaited transport, reported usage and canonical citations', async () => {
  let request
  const { model, trace, telemetry } = await review(async (url, init) => { request = { url, init }; await new Promise(r => setTimeout(r, 6)); return result() })
  assert.equal(request.url, 'https://api.openai.com/v1/responses')
  const body = JSON.parse(request.init.body)
  assert.equal(body.store, false)
  assert.equal(body.text.format.strict, true)
  assert.equal(body.reasoning.effort, 'none')
  assert(!body.tools)
  assert.equal(model.status, 'accepted')
  assert.equal(trace.mode, 'model-assisted')
  assert.equal(trace.model.inputTokens, 456)
  assert.equal(trace.model.outputTokens, 23)
  const span = trace.spans.find(s => s.name.startsWith('chat '))
  assert(span.durationMs >= 5)
  assert.equal(span.status, 'ok')
  assert.equal(span.attributes['gen_ai.provider.name'], 'openai')
  assert.equal(span.attributes['gen_ai.response.id'], 'resp_test')
  assert.equal(span.attributes['gen_ai.usage.output_tokens'], 23)
  assert.equal(span.parentId, trace.spans.find(s => !s.parentId).id)
  assert.deepEqual(model.selected, contract.evidenceBlocks(evidence).filter(b => ['result', 'working_0'].includes(b.id)))
  assert(model.selected[0].text.includes('$399,750.00'))
  assert(model.selected[0].sources.some(s => s.includes('credit_facilities')))
  assert.match(model.evidenceDigest, /^[a-f0-9]{64}$/)
  assert(!JSON.stringify(trace).includes(env.OPENAI_API_KEY))
  assert(!JSON.stringify(trace).includes('Secret RM prompt'))
  assert.equal(await telemetry.finish(undefined, true), trace, 'finish is idempotent')
})

test('unknown IDs, duplicate IDs, swapped facts, new numbers and model-written sources are rejected', async () => {
  for (const selection of [
    { status: 'supported', evidence_ids: ['unknown_client'] },
    { status: 'supported', evidence_ids: ['result', 'result'] },
    { status: 'supported', evidence_ids: [] },
    { status: 'supported', evidence_ids: ['result'], interest: '5.15%' },
    { status: 'supported', evidence_ids: ['result'], text: 'Ravi may sell listed positions' },
    { status: 'supported', evidence_ids: ['result'], sources: ['invented.csv'] },
    { status: 'insufficient_evidence', evidence_ids: ['result'] },
  ]) {
    const { trace, model } = await review(async () => result(selection))
    assert.equal(model.status, 'invalid_output')
    assert.equal(trace.mode, 'rules-fallback')
    assert.equal(trace.spans.find(s => s.name.startsWith('chat ')).status, 'ok')
    assert.equal(trace.spans.find(s => s.name === 'llm.validate_evidence_selection').status, 'error')
    assert.equal(trace.evidence.exact, '$399,750.00')
    assert(!model.selected)
  }
})

test('provider errors and timeouts are distinguished and leave verified evidence intact', async () => {
  const denied = await review(async () => new Response('secret provider error body', { status: 401 }))
  assert.equal(denied.model.status, 'provider_error')
  assert.equal(denied.trace.spans.find(s => s.name.startsWith('chat ')).status, 'error')
  assert(!diagrams.evidenceDiagram(evidence, denied.model).includes('Validate response'))
  assert(!JSON.stringify(denied.trace).includes('secret provider error body'))
  const timeout = await review(async (_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new Error('secret timeout')), { once: true })), { timeoutMs: 10 })
  assert.equal(timeout.model.status, 'timeout')
  assert.equal(timeout.trace.mode, 'rules-fallback')
  assert.equal(timeout.trace.evidence.exact, '$399,750.00')
  assert(!diagrams.evidenceDiagram(evidence, timeout.model).includes('Validate response'))
  assert(!JSON.stringify(timeout.trace).includes('secret timeout'))
})

test('refusal, truncation, malformed JSON and excessive response size never become accepted output', async () => {
  const cases = [
    [result(undefined, { output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'refusal text not logged' }] }] }), 'refused'],
    [result(undefined, { status: 'incomplete' }), 'incomplete'],
    [result(undefined, { output: [{ type: 'message', content: [{ type: 'output_text', text: '{broken' }] }] }), 'invalid_output'],
    [new Response('x'.repeat(70000)), 'invalid_output'],
    [new Response('not JSON'), 'invalid_output'],
    [result({ status: 'insufficient_evidence', evidence_ids: [] }), 'insufficient_evidence'],
  ]
  for (const [response, expected] of cases) {
    const { model, trace } = await review(async () => response)
    assert.equal(model.status, expected)
    assert.equal(trace.mode, 'rules-fallback')
    assert(!JSON.stringify(trace).includes('refusal text not logged'))
  }
})

test('missing configuration, unsupported tasks, failed source checks and pre-cancellation make no request', async () => {
  const fetcher = async () => { throw new Error('must not call transport') }
  for (const [extra, expected] of [
    [{ env: {} }, 'not_configured'],
    [{ eligible: false }, 'not_needed'],
    [{ evidence: { ...evidence, checks: [{ label: 'Reconcile', status: 'fail', detail: 'Mismatch' }] } }, 'source_check_failed'],
    [{ signal: AbortSignal.abort() }, 'cancelled'],
  ]) {
    const { model, trace } = await review(fetcher, extra)
    assert.equal(model.status, expected)
    assert.equal(model.attempted, false)
    assert.equal(trace.mode, 'grounded-rules')
    assert(!trace.spans.some(s => s.name.startsWith('chat ')))
  }
})

test('usage is not invented and simultaneous traces remain isolated', async () => {
  const [one, two] = await Promise.all([review(async () => result(undefined, { usage: undefined })), review(async () => result(undefined, { usage: { input_tokens: -1, output_tokens: '23' } }))])
  assert.notEqual(one.trace.id, two.trace.id)
  for (const { model, trace } of [one, two]) {
    assert.equal(model.inputTokens, undefined)
    assert.equal(model.outputTokens, undefined)
    assert(!trace.spans.find(s => s.name.startsWith('chat ')).attributes['gen_ai.usage.input_tokens'])
    assert(trace.logs.every(l => l.traceId === trace.id))
  }
})

test('API calls pass configuration through, persist traced assistance, keep client links and verified reply', async () => {
  const sql = new DatabaseSync(':memory:')
  for (const file of ['0000_skinny_colossus.sql', '0001_numerous_lake.sql']) sql.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'))
  const db = { prepare(query) { let values = []; return { bind(...args) { values = args; return this }, async first() { return sql.prepare(query).get(...values) ?? null }, async all() { return { results: sql.prepare(query).all(...values) } }, async run() { return sql.prepare(query).run(...values) } } } }
  const request = () => new Request('https://groundwork.test/api/agent', { method: 'POST', headers: { 'content-type': 'application/json', 'oai-authenticated-user-id': 'rm-test', origin: 'https://groundwork.test' }, body: JSON.stringify({ type: 'chat', message: 'How did Ravi get 5.15% interest?' }) })
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async () => result()
    const response = await api.handlePriscilla(request(), db, { waitUntil() {} }, false, env)
    assert.equal(response.status, 200)
    const reply = await response.json()
    assert.equal(reply.trace.mode, 'model-assisted')
    assert.equal(reply.trace.storage, 'saved')
    assert.match(reply.message, /6.15%, not 5.15%/)
    assert.equal(reply.client_links[0].client_id, 'CL-0002')
    assert.equal(reply.trace.evidence.exact, '$399,750.00')
    globalThis.fetch = async () => result({ status: 'supported', evidence_ids: ['result'], fabricated: 'return 99%' })
    const fallback = await (await api.handlePriscilla(request(), db, { waitUntil() {} }, false, env)).json()
    assert.equal(fallback.trace.mode, 'rules-fallback')
    assert.equal(fallback.message, reply.message)
    assert(!JSON.stringify(fallback).includes('return 99%'))
  } finally { globalThis.fetch = previous; sql.close() }
})

test('UI labels and evidence maps distinguish a real call from a rules-only response', async () => {
  const { model } = await review(async () => result())
  assert.match(contract.modelReviewLabel(model), /Live model call completed/)
  assert.match(contract.modelReviewLabel({ ...model, status: 'not_configured', attempted: false }), /No model evidence was added/)
  assert(!diagrams.evidenceDiagram(evidence).includes('OpenAI'))
  const graph = diagrams.evidenceDiagram(evidence, model)
  assert(graph.includes('OpenAI evidence selection'))
  assert(!graph.includes('chain of thought'))
})
