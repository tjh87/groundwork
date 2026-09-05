import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { build } from 'esbuild'

async function source(path) {
  const compiled = await build({ entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', write: false, banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(process.cwd() + '/package.json');" } })
  try { return await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64')) } catch (e) { throw new Error(`Module load: ${e.message}`) }
}
const [evidence, model, telemetry, api, traces, diagrams, recEvidence, rec] = await Promise.all(['../lib/calculation-evidence.ts', '../lib/wealth-model.ts', '../lib/observability.ts', '../lib/priscilla/api.ts', '../lib/priscilla/trace-store.ts', '../lib/evidence-diagram.ts', '../lib/recommendation-evidence.ts', '../lib/recommendations.ts'].map(source))
const ravi = model.wealthFor('CL-0002')
const close = (a, b) => assert(Math.abs(a - b) < .00001, `${a} != ${b}`)
const adapter = sql => ({ prepare(query) { let values = []; return { bind(...args) { values = args; return this }, async first() { return sql.prepare(query).get(...values) ?? null }, async all() { return { results: sql.prepare(query).all(...values) } }, async run() { return sql.prepare(query).run(...values) } } } })
const database = () => { const sql = new DatabaseSync(':memory:'); for (const file of ['0000_skinny_colossus.sql', '0001_numerous_lake.sql']) sql.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8')); return sql }
const request = (path, body, user = 'rm-a') => new Request('https://groundwork.test' + path, { method: body ? 'POST' : 'GET', headers: { ...(user ? { 'oai-authenticated-user-id': user } : {}), ...(body ? { 'content-type': 'application/json', origin: 'https://groundwork.test' } : {}) }, body: body ? JSON.stringify(body) : undefined })

test('source interest, basis points, period and rounding reconcile with independently known cash costs', () => {
  const f = ravi.facilities[0]
  assert.equal(f.rate, 6.15)
  close(evidence.facilityInterest(f).amount, 399750)
  close(evidence.facilityInterest(f, 6).amount, 199875)
  close(evidence.facilityInterest(f, 12, 100).rate, 7.15)
  close(evidence.facilityInterest(f, 12, 100).amount, 464750)
  close(evidence.facilityInterest(f, 12, 100).amount - evidence.facilityInterest(f).amount, 65000)
  close(evidence.facilityInterest(f, 12, -100).amount, 334750)
  assert.equal(evidence.interestEvidence(ravi).result, 'USD 0.40m')
  assert(evidence.interestEvidence(ravi).inputs.some(row => row.value === '6.15%' && row.source.endsWith('interest_rate_pct')))
  assert.equal(evidence.fundingEvidence(ravi, 2e6).exact, '$2,199,875.00')
  assert.equal(evidence.fundingEvidence(ravi, NaN).result, 'Unavailable')
})

test('every source client and scenario has reconciled position contributions and correct denominators', () => {
  for (const client of model.snapshot.clients) {
    const wealth = model.wealthFor(client.id)
    for (const scenario of model.scenarios) {
      const proof = evidence.stressEvidence(wealth, scenario.id, 'BAL')
      const calculated = model.stress(wealth, scenario.id, 'BAL')
      assert(!proof.checks.some(check => check.status === 'fail'))
      assert.equal(proof.table.rows.length, wealth.holdings.length)
      close(calculated.changePct, calculated.change / wealth.gross * 100)
      assert(proof.result.includes(calculated.changePct.toFixed(2)))
      for (const facility of wealth.facilities) {
        const collateral = evidence.collateralEvidence(wealth, scenario.id, 'BAL', facility.id)
        assert.equal(collateral.checks.find(c => c.label === 'Collateral contributions reconcile').status, 'pass')
      }
    }
  }
  const tech = evidence.stressEvidence(ravi, 'technology', 'GROW')
  assert.equal(tech.exact, '-$10,766,642.00')
  assert.notEqual(tech.result, evidence.stressEvidence(ravi, 'recession', 'GROW').result)
})

test('external assumptions stay labelled and blocked Ravi cash moves cannot create a benefit', () => {
  const wealth = model.wealthFor('CL-0002', [{ id: 'DEMO-test', name: 'Test reserve', model: 'reserve', value: 1e7, debt: 1e6, currency: 'USD' }])
  const interest = evidence.interestEvidence(wealth)
  assert.equal(interest.exact, '$459,750.00')
  assert(interest.inputs.some(i => i.value.includes('assumed 6%') && i.kind === 'RM input'))
  assert.equal(evidence.cashDecisionEvidence(ravi, 'technology', 'GROW', 20).exact, '$0.00')
  assert.match(evidence.cashDecisionEvidence(ravi, 'technology', 'GROW', 20).summary, /no-listed-sales/)
})

test('RecSys proofs preserve unavailable scores and mandatory gates', () => {
  for (const clientId of ['CL-0002', 'CL-0012', 'CL-0001']) {
    const wealth = model.wealthFor(clientId)
    const input = { accountId: rec.defaultTargetAccount(wealth), priorities: rec.defaultPriorities(wealth), reserveGoal: rec.defaultReserveGoal(wealth, 0), reserveCurrency: rec.defaultReserveCurrency(wealth), annualNeed: 0, targetYield: null, lossLimit: 15, horizon: wealth.client.horizon, incomeMultiplier: 1, rules: { sustainability: false, gambling: false, tobacco: false, weapons: false, faith: false }, maxTransitionPct: 100 }
    for (const candidate of rec.recommendPortfolios(wealth, input).candidates) {
      const proof = recEvidence.recommendationEvidence(wealth, input, candidate.id)
      assert.equal(proof.checks.filter(c => c.status === 'fail').length, candidate.blocks.length)
      if (candidate.score === null) assert.equal(proof.result, 'Score unavailable')
      else assert(proof.result.includes(candidate.score.toFixed(2)))
    }
  }
})

test('OpenTelemetry creates real child spans and correlated logs; errors are redacted', async () => {
  const operation = telemetry.startDecisionTrace('test.parent', 'server')
  assert.equal(operation.run('test.calculate', () => 6 * 7), 42)
  assert.throws(() => operation.run('test.failure', () => { throw new Error('secret prompt 12345') }))
  const record = await operation.finish()
  assert.match(record.id, /^[a-f0-9]{32}$/)
  const root = record.spans.find(s => s.name === 'test.parent')
  assert(record.spans.filter(s => s !== root).every(s => s.parentId === root.id))
  assert.equal(record.spans.find(s => s.name === 'test.failure').status, 'error')
  assert(record.logs.length >= 3)
  assert(record.logs.every(l => l.traceId === record.id && record.spans.some(s => s.id === l.spanId)))
  assert(!JSON.stringify(record).includes('secret prompt'))
  const [one, two] = await Promise.all([telemetry.traceEvidence(() => evidence.interestEvidence(ravi)), telemetry.traceEvidence(() => evidence.fundingEvidence(ravi, 2e6))])
  assert.notEqual(one.id, two.id)
  assert(one.logs.every(l => l.traceId === one.id))
  assert(two.logs.every(l => l.traceId === two.id))
})

test('chat traces are saved by RM, contain the used evidence, and do not invent LLM calls', async () => {
  const sql = database(), db = adapter(sql), context = { waitUntil() {} }
  try {
    const response = await api.handlePriscilla(request('/api/agent', { type: 'chat', message: 'How did Ravi get 5.15% interest?' }), db, context)
    assert.equal(response.status, 200)
    const reply = await response.json()
    assert.match(reply.message, /6.15%, not 5.15%/)
    assert.equal(reply.trace.evidence.exact, '$399,750.00')
    assert.equal(reply.trace.storage, 'saved')
    assert.equal(reply.trace.mode, 'grounded-rules')
    assert(reply.trace.spans.some(s => s.events.some(e => e.name === 'llm.not_configured')))
    assert(!reply.trace.spans.some(s => s.name.startsWith('chat ') || s.attributes['gen_ai.request.model']))
    assert(!JSON.stringify(reply.trace.logs).includes('5.15'))
    assert.equal((await api.handlePriscilla(request('/api/agent/trace/' + reply.trace.id), db, context)).status, 200)
    assert.equal((await api.handlePriscilla(request('/api/agent/trace/' + reply.trace.id, undefined, 'rm-b'), db, context)).status, 404)
    assert.equal((await api.handlePriscilla(request('/api/agent/trace/' + reply.trace.id, undefined, ''), db, context)).status, 401)
    const root = reply.trace.spans.find(s => !s.parentId)
    assert(reply.trace.spans.filter(s => s.parentId).every(s => s.parentId === root.id))
  } finally { sql.close() }
})

test('saved trace retention is bounded and absent telemetry storage does not break the reply', async () => {
  const sql = database(), db = adapter(sql)
  try {
    const template = await telemetry.traceEvidence(() => evidence.interestEvidence(ravi))
    for (let i = 0; i < 103; i++) await traces.saveTrace(db, 'rm-a', { ...template, id: i.toString(16).padStart(32, '0') })
    assert.equal(sql.prepare("SELECT count(*) AS n FROM groundwork_traces WHERE user_id='rm-a'").get().n, 100)
    const old = { ...template, id: 'f'.repeat(32), startedAt: '2020-01-01T00:00:00.000Z' }
    await traces.saveTrace(db, 'rm-b', old)
    assert.equal(await traces.readTrace(db, 'rm-b', old.id), null)
    sql.exec('DROP TABLE groundwork_traces')
    const reply = await (await api.handlePriscilla(request('/api/agent', { type: 'chat', message: 'Ravi technology stress' }), db, { waitUntil() {} })).json()
    assert.equal(reply.type, 'analysis')
    assert.equal(reply.trace.storage, 'unavailable')
  } finally { sql.close() }
})

test('Mermaid generation accepts only escaped labels and no executable directives', () => {
  const proof = evidence.interestEvidence(ravi)
  const graph = diagrams.evidenceDiagram({ ...proof, result: '\"] --> evil["bad\\nclick evil javascript:alert(1)' })
  assert(!graph.includes('\nclick'))
  assert(!graph.includes('javascript:'))
  assert(!graph.includes('<script'))
  assert(graph.startsWith('flowchart TD'))
})
