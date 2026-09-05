import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

const compiled = await build({ entryPoints: [new URL('../lib/wealth-model.ts', import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', write: false })
const model = await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'))
const { snapshot, wealthFor, sum, pct, stress, scenarios, incomeModel, valuesScreen, rebalanceToCash, allocation, accountChecks } = model
const close = (actual, expected, epsilon = .3) => assert(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`)
const example = { id: 'DEMO-1', name: 'External reserve example', model: 'reserve', value: 10000000, debt: 0, currency: 'USD' }

test('all source clients, accounts and current positions reconcile, without historical double-counting', () => {
  assert.equal(snapshot.clients.length, 20); assert.equal(snapshot.accounts.length, 24); assert.equal(snapshot.holdings.length, 206)
  assert.equal(new Set(snapshot.holdings.map(h => h.id)).size, 206)
  for (const c of snapshot.clients) {
    const w = wealthFor(c.id)
    close(w.gross, sum(w.accounts, a => a.value))
    close(w.gross, sum(w.buckets, b => b.value))
    close(w.net, w.gross - w.debt)
  }
  assert.equal(snapshot.issues.length, 0)
})
test('Ravi keeps both accounts, current debt and dated no-sale notes', () => {
  const w = wealthFor('CL-0002')
  assert.equal(w.accounts.length, 2); close(w.gross, 46699200); close(w.debt, 6500000); close(w.net, 40199200)
  close(w.freeCash, 0); assert.equal(w.stale.length, 1)
  assert(w.client.notes.some(n => n.date === '2026-06-11' && n.text.includes('1.7m')))
})
test('FX conversion retains HKD facility debt in USD without changing its LTV', () => {
  const w = wealthFor('CL-0014'), f = w.facilities[0]
  close(f.drawn, 58000000 / 7.81)
  close(pct(f.drawn, f.lendingValue), 69.41, .01)
})
test('external examples add once; duplicates and non-finite inputs are rejected', () => {
  const source = wealthFor('CL-0002'), w = wealthFor('CL-0002', [{ ...example, debt: 2000000 }])
  close(w.gross - source.gross, 10000000); close(w.debt - source.debt, 2000000)
  close(w.net - source.net, 8000000); assert.equal(w.accounts.length, 3)
  assert.throws(() => wealthFor('CL-0002', [example, example]))
  assert.throws(() => wealthFor('CL-0002', [{ ...example, id: 'PF-0003' }]))
  assert.throws(() => wealthFor('CL-0002', [{ ...example, value: NaN }]))
})
test('same instrument in a separate bank increases combined concentration instead of cancelling it', () => {
  const w = wealthFor('CL-0002', [{ ...example, model: 'technology' }])
  const issuer = w.singleNames.find(n => n.name === 'Helios Cloud Systems') || w.singleNames.find(n => n.name.includes('Helios'))
  assert(issuer); assert.equal(issuer.accounts.size, 2)
  close(issuer.value, 2069600 + 6000000)
})
test('losses and gains sum to the net result in every scenario for all clients', () => {
  for (const client of snapshot.clients) for (const s of scenarios) {
    const w = wealthFor(client.id), r = stress(w, s.id, w.accounts[0].mandate)
    close(r.gains - r.losses, r.change)
    close(sum(r.rows, row => row.after), r.after)
    close(r.after, w.gross + r.change)
    assert(Number.isFinite(r.changePct)); assert(Number.isFinite(r.benchmarkPct))
    for (const loan of r.loans) assert(Number.isFinite(loan.ltv))
  }
})
test('a reserve can offset an account loss, but does not cure source collateral', () => {
  const base = stress(wealthFor('CL-0002'), 'technology', 'GROW')
  const withReserve = stress(wealthFor('CL-0002', [example]), 'technology', 'GROW')
  assert(withReserve.gains > 0)
  assert(withReserve.change > base.change)
  close(withReserve.loans[0].repaymentGap, base.loans[0].repaymentGap)
  assert(base.loans[0].repaymentGap > 0)
})
test('correlation-failure scenario removes the hypothetical offset', () => {
  const r = stress(wealthFor('CL-0002', [example]), 'correlation', 'GROW')
  close(r.gains, 0); assert(r.rows.every(row => row.change < 0))
})
test('current loan headroom uses the trigger, not contractual facility capacity', () => {
  const r = stress(wealthFor('CL-0002'), 'delay', 'GROW'), loan = r.loans[0]
  close(loan.headroom, 114107.5)
  close(loan.beforeLtv, 73.705, .01); close(loan.repaymentGap, 0)
})
test('FX stress revalues matching non-home assets and debt consistently', () => {
  const w = wealthFor('CL-0001'), r = stress(w, 'currency', 'BALG')
  // Source SGD facility debt has no home-currency shock.
  close(r.debtChange, 0)
  const nonhome = wealthFor('CL-0002', [{ ...example, currency: 'EUR', debt: 1000000 }])
  const result = stress(nonhome, 'currency', 'GROW')
  close(result.debtChange, 1000000 * (1 / 1.1 - 1))
  close(result.netChange, result.change - result.debtChange)
})
test('no-sale client preference blocks the proposed equity sale', () => {
  const w = wealthFor('CL-0002', [example]), r = rebalanceToCash(w, 20)
  close(r.moved, 0); assert.match(r.reason, /Blocked/)
})
test('rebalance conserves wealth and never sells pledged or custody positions', () => {
  for (const c of snapshot.clients) {
    const w = wealthFor(c.id), r = rebalanceToCash(w, 10)
    close(sum(r.holdings, h => h.value), w.gross)
    for (const h of w.holdings.filter(h => w.pledged.has(h.accountId) || w.accounts.find(a => a.id === h.accountId).service === 'Custody')) close(r.holdings.find(n => n.id === h.id).value, h.value)
  }
  assert(rebalanceToCash(wealthFor('CL-0012'), 10).moved > 0)
})
test('custody is not assigned an allocation breach; managed accounts retain separate rules', () => {
  const w = wealthFor('CL-0002')
  assert.equal(accountChecks(w.accounts.find(a => a.service === 'Custody'), w.holdings).length, 0)
  const conservative = wealthFor('CL-0003')
  assert(accountChecks(conservative.accounts[0], conservative.holdings).some(i => i.startsWith('Equity')))
  for (const code of new Set(snapshot.mandates.map(m => m.code))) close(sum(allocation(w.holdings, code), a => a.target), code === 'ALTS' ? 93 : 100)
  assert.equal(stress(w, 'technology', 'ALTS').benchmarkPct, null)
})
test('new religious/ethical requests return unknown, not an inferred clean screen', () => {
  const w = wealthFor('CL-0002'), clear = { sustainability: false, gambling: false, tobacco: false, weapons: false, faith: false }
  assert.equal(valuesScreen(w.holdings, clear).active, false)
  const result = valuesScreen(w.holdings, { ...clear, gambling: true, faith: true })
  assert(result.unresolved.length > 0); assert.equal(result.blocked.length, 0)
})
test('source sustainability flags are retained and not treated as full faith-based screening', () => {
  const w = wealthFor('CL-0005'), r = valuesScreen(w.holdings, { sustainability: true, gambling: true, tobacco: false, weapons: false, faith: false })
  assert(r.blocked.length > 0); assert(r.unresolved.length > 0)
})
test('income separates loan costs and does not guess multi-year fees or private distributions', () => {
  const ravi = incomeModel(wealthFor('CL-0002'))
  close(ravi.interest, 399750); close(ravi.netLow, ravi.low - ravi.interest)
  close(incomeModel(wealthFor('CL-0012')).annualNeed, 1280000)
  close(incomeModel(wealthFor('CL-0006')).annualNeed, 0)
  const low = incomeModel(wealthFor('CL-0002'), 0)
  close(low.low, 0); close(low.netLow, -399750)
})
