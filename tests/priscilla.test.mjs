import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { build } from 'esbuild'

async function source(path) {
  const compiled = await build({ entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', write: false, banner: { js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(process.cwd() + '/package.json');" } })
  return import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'))
}
const [engine, api, wealth, directory] = await Promise.all(['../lib/priscilla/engine.ts', '../lib/priscilla/api.ts', '../lib/wealth-model.ts', '../lib/data.ts'].map(source))
const raw = engine.allActions()
const cohorts = JSON.parse(readFileSync(new URL('../lib/priscilla/cohorts.json', import.meta.url)))
const migration = readFileSync(new URL('../drizzle/0000_skinny_colossus.sql', import.meta.url), 'utf8')
const adapter = sql => ({ prepare(query) { let values = []; return { bind(...args) { values = args; return this }, async first() { return sql.prepare(query).get(...values) ?? null }, async all() { return { results: sql.prepare(query).all(...values) } }, async run() { return sql.prepare(query).run(...values) } } } })
const context = { waitUntil() {} }
function request(path, body, user = 'rm-a', extra = {}) { return new Request(`https://advisory.test${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { ...(user ? { 'oai-authenticated-user-id': user } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json', origin: 'https://advisory.test' }), ...extra }, body: body === undefined ? undefined : JSON.stringify(body) }) }

test('all 20 clients have grounded, finite, stable actions and five-part briefings', () => {
  assert.equal(new Set(raw.map(r => r.id)).size, raw.length)
  assert.equal(new Set(raw.map(r => r.client_id)).size, 20)
  for (const c of wealth.snapshot.clients) {
    assert.equal(engine.clientInsight(c.id).split('\n\n').length, 5)
    assert.match(engine.clientInsight(c.id), /YTD performance is not supplied/)
  }
  for (const r of raw) { assert(Number.isFinite(r.score)); assert(r.grounding.length > 0); assert(r.rationale.length > 30); assert(!/NaN|Infinity|undefined/.test(JSON.stringify(r))) }
  assert.match(raw.find(r => r.client_id === 'CL-0002' && r.kind === 'credit').rationale, /73.71%.*75%.*no-listed-sales.*not settled cash/)
  assert.match(raw.find(r => r.client_id === 'CL-0012' && r.kind === 'liquidity').rationale, /USD reserve: \$800K/)
})

test('peer notes count the actual source cohort and use no invented returns', () => {
  for (const r of engine.rankActions(raw)) {
    const peers = Object.keys(cohorts).filter(id => id !== r.client_id && JSON.stringify(cohorts[id]) === JSON.stringify(cohorts[r.client_id]))
    const common = peers.filter(id => raw.some(other => other.client_id === id && other.kind === r.kind)).length
    if (peers.length) assert(r.peer_note.startsWith(`${common} of ${peers.length} other clients`))
    else assert.match(r.peer_note, /No peer signal/)
  }
})

test('feedback adds 15 once to similar items and dismissal removes then re-ranks', () => {
  const item = raw.find(r => r.kind === 'mandate')
  const feedback = { recommendation_id: item.id, kind: item.kind, action: 'accepted' }
  const ranked = engine.rankActions(raw, [feedback, feedback])
  assert.equal(ranked[0].kind, 'mandate')
  for (const r of ranked) assert.equal(r.score - r.base_score, r.kind === item.kind ? 15 : 0)
  const dismissed = engine.rankActions(raw, [{ ...feedback, action: 'dismissed' }])
  assert(!dismissed.some(r => r.id === item.id))
  assert.equal(engine.summarise(dismissed).urgent, raw.filter(r => ['call', 'action'].includes(r.type)).length - 1)
  assert.equal(engine.summarise([]).top_client, null)
})

test('chat uses selected-client facts and asks instead of guessing a missing scenario', () => {
  const ranked = engine.rankActions(raw)
  assert.match(engine.chatReply('Brief this client', { client_id: 'CL-0012' }, ranked).message, /^Cheung Kwok Wing has/)
  assert.match(engine.chatReply('yes', { client_id: 'CL-0002' }, ranked).message, /^Ravi Chandrasekaran has/)
  assert.match(engine.chatReply('yes', { client_id: 'CL-0002', briefing_scope: 'book' }, ranked).message, /^I would start/)
  assert.match(engine.chatReply('today’s briefing', {}, ranked).message, /Sources:.*credit_facilities/)
  assert.match(engine.chatReply('risk framework', {}, ranked).message, /five controls/)
  assert.match(engine.chatReply('Run a scenario', { client_id: 'CL-0002' }, ranked).message, /Which test/)
  assert.match(engine.chatReply('Ravi and Cheung technology stress', {}, ranked).message, /Which client/)
  assert.match(engine.chatReply('important technology stress', { client_id: 'CL-0002' }, ranked).message, /^Ravi/)
  const result = engine.chatReply('Ravi technology stress', {}, ranked).message
  const expected = wealth.stress(wealth.wealthFor('CL-0002'), 'technology', 'GROW')
  assert(result.includes(`${expected.changePct.toFixed(2)}%`))
  assert(result.includes(wealth.exactMoney(expected.loans[0].repaymentGap)))
  assert.match(result, /not a forecast/)
  assert.equal(engine.chatReply('Ravi portfolio technology stress', {}, ranked).message, result)
  assert.match(engine.chatReply('YTD return', {}, ranked).message, /unavailable/)
})

test('API feedback survives database reopening and remains isolated by RM identity', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'priscilla-'))
  const path = join(folder, 'feedback.sqlite')
  let sql = new DatabaseSync(path)
  try {
    sql.exec(migration)
    const item = raw.find(r => r.kind === 'mandate')
    const first = await api.handlePriscilla(request(`/recommendations/${item.id}/feedback`, { action: 'accepted' }), adapter(sql), context)
    assert.equal(first.status, 200)
    sql.close(); sql = new DatabaseSync(path)
    const queue = await (await api.handlePriscilla(request('/recommendations'), adapter(sql), context)).json()
    assert.equal(queue.recommendations.find(r => r.id === item.id).feedback, 'accepted')
    assert.equal(queue.recommendations.find(r => r.id === item.id).score, item.base_score + 15)
    const other = await (await api.handlePriscilla(request('/recommendations', undefined, 'rm-b'), adapter(sql), context)).json()
    assert.equal(other.recommendations.find(r => r.id === item.id).feedback, undefined)
    assert.equal(other.recommendations.find(r => r.id === item.id).score, item.base_score)
    await api.handlePriscilla(request(`/recommendations/${item.id}/feedback`, { action: 'dismissed' }), adapter(sql), context)
    const after = await (await api.handlePriscilla(request('/recommendations'), adapter(sql), context)).json()
    assert(!after.recommendations.some(r => r.id === item.id))
  } finally { sql.close(); rmSync(folder, { recursive: true, force: true }) }
})

test('chat client links follow visible priorities and resolve all 20 client files', () => {
  const dismissed = raw.find(r => r.client_id === 'CL-0002' && r.kind === 'credit')
  const ranked = engine.rankActions(raw, [{ recommendation_id: dismissed.id, kind: dismissed.kind, action: 'dismissed' }])
  const reply = engine.chatReply('Who needs attention?', {}, ranked)
  assert.deepEqual(reply.client_links.map(link => link.client_id), [...new Set(ranked.slice(0, 4).map(r => r.client_id))])
  assert(!reply.message.includes(dismissed.rationale))
  for (const client of directory.clientDirectory) {
    const links = engine.chatReply(`Open ${client.name}`, { client_id: 'CL-0002' }, ranked).client_links
    assert.deepEqual(links, [{ client_id: client.id, client_name: client.name, href: `/client/${client.slug}#client-brief` }])
  }
  const cheung = engine.chatReply('Recommended actions for Cheung Kwok Wing', { client_id: 'CL-0002' }, ranked)
  assert.deepEqual(cheung.client_links.map(link => link.client_id), ['CL-0012'])
  assert(!cheung.message.includes('Ravi'))
  assert.equal(engine.chatReply('Bring me to the top client', {}, ranked).client_links[0].client_id, ranked[0].client_id)
  assert.deepEqual(engine.chatReply('Who needs attention?', {}, []).client_links, [])
})

test('unknown and ambiguous navigation never silently chooses another client', () => {
  const ranked = engine.rankActions(raw)
  for (const prompt of ['Open Morgan', 'Open Morgan first', 'Open', 'Bring me to the top client']) {
    const reply = engine.chatReply(prompt, { client_id: 'CL-0002' }, prompt.includes('top') ? [] : ranked)
    assert(!reply.client_links?.length)
    assert.match(reply.message, /No client was selected/)
  }
  const ambiguous = engine.chatReply('Open Ravi and Cheung', {}, ranked)
  assert.match(ambiguous.message, /Which client/)
  assert.equal(ambiguous.client_links.length, 2)
})

test('scan responds before completion, deduplicates and leaves ping available', async () => {
  const sql = new DatabaseSync(':memory:'); sql.exec(migration)
  const pending = [], execution = { waitUntil(job) { pending.push(job) } }, db = adapter(sql)
  try {
    const start = await api.handlePriscilla(request('/api/agent', { type: 'scan' }), db, execution)
    assert.equal(start.status, 202)
    const job = await start.json()
    const running = await (await api.handlePriscilla(request(`/api/agent/scan/${job.job_id}`), db, execution)).json()
    assert.equal(running.type, 'scan_running')
    const ping = await (await api.handlePriscilla(request('/api/agent', { type: 'ping' }), db, execution)).json()
    assert.equal(ping.type, 'pong')
    const duplicate = await (await api.handlePriscilla(request('/api/agent', { type: 'scan' }), db, execution)).json()
    assert.equal(duplicate.job_id, job.job_id)
    assert.equal(pending.length, 1)
    await Promise.all(pending)
    const complete = await (await api.handlePriscilla(request(`/api/agent/scan/${job.job_id}`), db, execution)).json()
    assert.equal(complete.type, 'scan_results')
    assert.deepEqual(complete.summary, engine.summarise(engine.rankActions(raw)))
    assert.deepEqual(complete.client_links.map(link => link.client_id), [...new Set(engine.rankActions(raw).slice(0, 4).map(r => r.client_id))])
    assert.equal((await api.handlePriscilla(request(`/api/agent/scan/${job.job_id}`, undefined, 'rm-b'), db, execution)).status, 404)
  } finally { sql.close() }
})

test('auth, bad inputs and unavailable storage fail visibly without affecting page routing', async () => {
  const sql = new DatabaseSync(':memory:'); sql.exec(migration); const db = adapter(sql)
  try {
    assert.equal((await api.handlePriscilla(request('/recommendations', undefined, ''), db, context)).status, 401)
    assert.equal((await api.handlePriscilla(request('/api/agent', { type: 'ping' }, 'rm-a', { origin: 'https://other.test' }), db, context)).status, 403)
    assert.equal((await api.handlePriscilla(request('/recommendations/no-such-id/feedback', { action: 'accepted' }), db, context)).status, 404)
    assert.equal((await api.handlePriscilla(request(`/recommendations/${raw[0].id}/feedback`, { action: 'approve-trade' }), db, context)).status, 400)
    assert.equal((await api.handlePriscilla(request('/api/agent', { type: 'chat', message: 'x'.repeat(1501) }), db, context)).status, 400)
    assert.equal((await api.handlePriscilla(request('/api/agent', { type: 'chat', message: 'brief', context: { client_id: 'CL-9999' } }), db, context)).status, 400)
    assert.equal((await api.handlePriscilla(request('/clients/CL-9999/insight'), db, context)).status, 404)
    assert.equal((await api.handlePriscilla(request('/recommendations'), undefined, context)).status, 503)
    assert.equal(await api.handlePriscilla(request('/client/ravi-chandrasekaran'), db, context), null)
  } finally { sql.close() }
})
