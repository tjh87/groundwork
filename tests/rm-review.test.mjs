import assert from 'node:assert/strict'
import test, { afterEach } from 'node:test'
import { build } from 'esbuild'

async function source(path) {
  const compiled = await build({ entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', write: false })
  return import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'))
}
const [w, rec, ledger, actions, inputs] = await Promise.all(['../lib/wealth-model.ts', '../lib/recommendations.ts', '../lib/ledger.ts', '../lib/rm-actions.ts', '../lib/input-validation.ts'].map(source))
const clear = { sustainability: false, gambling: false, tobacco: false, weapons: false, faith: false }
const close = (a, b) => assert(Math.abs(a - b) < .01, `${a} != ${b}`)
const client = w.wealthFor('CL-0012')
const base = { accountId: rec.defaultTargetAccount(client), priorities: rec.defaultPriorities(client), reserveGoal: 2560000, reserveCurrency: 'USD', annualNeed: 1280000, targetYield: null, lossLimit: 15, horizon: 12, incomeMultiplier: 1, rules: clear, maxTransitionPct: 100 }

test('invalid financial inputs cannot remove a gate or produce scores', () => {
  for (const patch of [{ reserveGoal: -1 }, { reserveGoal: Infinity }, { annualNeed: NaN }, { annualNeed: -5 }, { horizon: NaN }, { targetYield: -1 }, { lossLimit: NaN }, { reserveCurrency: '__proto__' }, { accountId: 'PF-0003' }]) {
    const report = rec.recommendPortfolios(client, { ...base, ...patch })
    assert(report.inputErrors.length > 0)
    assert.equal(report.top, null)
    assert(report.candidates.every(c => c.score === null && c.rank === null && c.blocks.some(g => g.key === 'goals')))
  }
})
test('an empty numeric draft is unknown; zero must be explicitly entered', () => {
  assert(Number.isNaN(inputs.draftNumber('')))
  assert(inputs.draftIssue('Spending', '', 0, 1e9))
  assert.equal(inputs.draftIssue('Spending', '0', 0, 1e9), '')
  assert(inputs.draftIssue('Spending', '-1', 0, 1e9))
  assert.equal(inputs.draftIssue('Optional yield', '', 0, 100, true), '')
})
test('cash-move tool and RecSys protect Cheung loss and unknown-cost positions', () => {
  const unknown = { ...client, holdings: client.holdings.map(h => h.asset === 'Equity' ? { ...h, cost: null } : h) }
  assert.equal(w.rebalanceToCash(unknown, 20).moved, 0)
  const moved = w.rebalanceToCash(client, 20)
  for (const h of client.holdings.filter(h => h.cost === null || h.value < h.cost)) close(moved.holdings.find(n => n.id === h.id).value, h.value)
  assert(moved.moved > 0)
})
test('cash moves preserve each account and currency and never sell external examples', () => {
  for (const c of w.snapshot.clients) {
    const wealth = w.wealthFor(c.id, [{ id: 'DEMO-review', name: 'Example growth', value: 1e7, debt: 0, currency: 'EUR', model: 'technology' }])
    const moved = w.rebalanceToCash(wealth, 20)
    for (const holding of wealth.holdings.filter(h => h.external)) close(moved.holdings.find(h => h.id === holding.id).value, holding.value)
    for (const a of wealth.accounts) for (const currency of new Set(wealth.holdings.filter(h => h.accountId === a.id).map(h => h.currency))) {
      const amount = holdings => w.sum(holdings.filter(h => h.accountId === a.id && h.currency === currency), h => h.value)
      close(amount(moved.holdings), amount(wealth.holdings))
    }
  }
})
test('funding gaps exclude other-currency cash and unknown budgets', () => {
  const result = w.fundingPlan(client, 1e6)
  close(result.availableUSD, 800000)
  close(result.gap, 200000)
  assert(result.otherCurrencyCash > 1e6)
  assert.equal(w.fundingPlan(client, NaN).gap, null)
  assert.equal(w.fundingPlan(client, -1).gap, null)
  const ravi = w.fundingPlan(w.wealthFor('CL-0002'), 2000000)
  close(ravi.gap, 2199875)
})
test('zero-loss stress does not emit negative zero or duplicate minus signs', () => {
  const result = w.stress(w.wealthFor('CL-0002'), 'delay', 'GROW')
  assert.equal(Object.is(result.losses, -0), false)
  assert.equal(w.signedMoney(-result.losses), '$0')
  assert.equal(w.money(-0), '$0')
  assert.equal(w.money(Infinity), 'Unavailable')
})

const originalWindow = globalThis.window
const originalNotification = globalThis.Notification
afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window; else globalThis.window = originalWindow
  if (originalNotification === undefined) delete globalThis.Notification; else globalThis.Notification = originalNotification
})
function browserStorage() {
  const data = new Map()
  globalThis.window = { localStorage: { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }, dispatchEvent() {} }
  return data
}
const draft = { insightId: 'case-review', client: 'Example', insightTitle: 'Test review', decision: 'Modify', note: 'Check the funding route.' }
const action = { id: 'case-action', client: 'Private client name', slug: 'example', title: 'Review collateral', message: 'Private balance USD 6500000', due: 'Today', urgency: 'Critical' }

test('malformed saved records cannot crash reads or be silently overwritten', () => {
  const data = browserStorage()
  for (const corrupt of ['null', '{}', '[{}]', 'bad JSON']) {
    data.set('advisory-grade-rm-ledger-v1', corrupt)
    data.set('advisory-grade-rm-actions-v1', corrupt)
    assert.deepEqual(ledger.getDecisions(), [])
    assert.deepEqual(actions.getRMActionStates(), [])
    assert.throws(() => ledger.appendDecision(draft))
    assert.throws(() => actions.markRMAction(action.id, true))
    assert.equal(data.get('advisory-grade-rm-ledger-v1'), corrupt)
    assert.equal(data.get('advisory-grade-rm-actions-v1'), corrupt)
  }
})
test('storage failures do not record false completion or send a notification', async () => {
  browserStorage()
  globalThis.window.localStorage.setItem = () => { throw new Error('Quota exceeded') }
  let called = 0
  globalThis.Notification = class { static permission = 'granted'; constructor() { called++ } }
  assert.throws(() => actions.markRMAction(action.id, true))
  await assert.rejects(() => actions.pushRMAction(action))
  assert.equal(called, 0)
  assert.deepEqual(actions.getRMActionStates(), [])
})
test('denied, unavailable and failing notifications keep an honest local fallback', async () => {
  browserStorage()
  for (const notification of [undefined, class { static permission = 'denied' }, class { static permission = 'default'; static requestPermission() { throw new Error('Blocked') } }, class { static permission = 'granted'; constructor() { throw new Error('Unsupported') } }]) {
    globalThis.Notification = notification
    const result = await actions.pushRMAction(action)
    assert.equal(result.delivery, 'in-app')
    assert.equal(result.recorded, true)
    assert.equal(actions.getRMActionStates()[0].delivery, 'in-app')
  }
})
test('notification text excludes client identity and portfolio details', async () => {
  browserStorage()
  let payload
  globalThis.Notification = class { static permission = 'granted'; constructor(title, options) { payload = { title, ...options } } }
  const result = await actions.pushRMAction(action)
  assert.equal(result.delivery, 'browser')
  assert(!JSON.stringify(payload).includes(action.client))
  assert(!JSON.stringify(payload).includes('6500000'))
})
test('completion can be reversed without losing other saved review data', () => {
  browserStorage()
  ledger.appendDecision(draft)
  actions.markRMAction(action.id, true)
  assert(actions.getRMActionStates()[0].completedAt)
  actions.markRMAction(action.id, false)
  assert.equal(actions.getRMActionStates()[0].completedAt, undefined)
  assert.equal(ledger.getDecisions().length, 1)
})
