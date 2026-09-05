import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

async function moduleAt(path) {
  const output = await build({ entryPoints: [new URL(path, import.meta.url).pathname], bundle: true, platform: 'node', format: 'esm', write: false })
  return import('data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64'))
}
const [w, rec] = await Promise.all([moduleAt('../lib/wealth-model.ts'), moduleAt('../lib/recommendations.ts')])
const clearRules = { sustainability: false, gambling: false, tobacco: false, weapons: false, faith: false }
const close = (a, b, epsilon = .1) => assert(Math.abs(a - b) < epsilon, `${a} != ${b}`)
function inputFor(wealth, overrides = {}) {
  const annualNeed = w.incomeModel(wealth).annualNeed
  return { accountId: rec.defaultTargetAccount(wealth), priorities: rec.defaultPriorities(wealth), reserveGoal: rec.defaultReserveGoal(wealth, annualNeed), reserveCurrency: rec.defaultReserveCurrency(wealth), annualNeed, targetYield: null, lossLimit: 15, horizon: wealth.client.horizon, incomeMultiplier: 1, rules: clearRules, maxTransitionPct: 100, ...overrides }
}
function run(clientId, overrides = {}, external = []) {
  const wealth = w.wealthFor(clientId, external), input = inputFor(wealth, overrides)
  return { wealth, input, report: rec.recommendPortfolios(wealth, input) }
}

test('all 20 clients receive complete, finite, auditable candidate evaluations', () => {
  for (const client of w.snapshot.clients) {
    const { wealth, report } = run(client.id)
    assert.equal(report.candidates.length, 7)
    assert.equal(new Set(report.candidates.map(c => c.id)).size, 7)
    for (const c of report.candidates) {
      if (c.score === null) {
        assert(c.blocks.some(g => g.key === 'funding' || g.key === 'goals'))
        assert(c.scoreUnavailableReason)
        assert.equal(c.scoreChange, null)
        assert.deepEqual(c.scoreParts, [])
      } else {
        assert(Number.isFinite(c.score) && c.score >= 0 && c.score <= 100)
        close(c.score, w.sum(c.scoreParts, p => p.points), 1e-8)
        close(w.sum(c.scoreParts, p => p.weight), 100, 1e-8)
        close(c.scoreChange, c.score - report.baseline.score, 1e-8)
        assert.equal(c.scoreUnavailableReason, null)
      }
      close(w.sum(c.holdings, h => h.value), wealth.gross)
      assert(c.metrics.tests.every(t => Number.isFinite(t.change) && Number.isFinite(t.pct)))
      if (c.rank !== null) { assert.equal(c.blocks.length, 0); assert(c.gates.every(g => g.pass)) }
      else assert(c.blocks.length > 0)
      if (c.sleeves.length) close(w.sum(c.sleeves, s => s.weight), 100, 1e-6)
    }
    assert(report.evidence.some(e => e.source.includes(client.id)))
    assert.equal(report.top, report.eligible[0] || null)
  }
})
test('Ravi receives no portfolio shortlist while source sale and collateral constraints remain', () => {
  const { wealth, report } = run('CL-0002')
  assert.equal(report.top, null); assert.match(report.nextAction, /funding and collateral/)
  assert(Number.isFinite(report.baseline.score))
  assert.equal(report.unscored.length, 6)
  for (const c of report.candidates) {
    close(c.amount, 0)
    assert(c.blocks.some(g => g.key === 'credit'))
    close(w.sum(c.holdings, h => h.value), wealth.gross)
    if (c.id !== 'retain') {
      assert.equal(c.score, null)
      assert.equal(c.scoreChange, null)
      assert.equal(c.transitionPct, 0)
      assert.match(c.scoreUnavailableReason, /prohibits listed sales/)
    }
  }
  const aggressive = run('CL-0002', { priorities: { liquidity: 0, income: 0, preservation: 0, growth: 5, diversification: 0 }, lossLimit: 100 })
  assert.equal(aggressive.report.top, null)
  assert(aggressive.report.candidates.every(c => c.blocks.some(g => g.key === 'credit')))
})
test('Cheung can fund the draft reserve without selling loss or unknown-cost positions', () => {
  const { wealth, report } = run('CL-0012')
  assert(report.top, 'Expected a feasible reserve candidate')
  assert(report.top.metrics.reserveCash + 1 >= report.input.reserveGoal)
  assert.equal(w.accountChecks(wealth.accounts[0], report.top.holdings).length, 0)
  for (const h of wealth.holdings.filter(h => h.cost === null || h.value < h.cost)) {
    close(report.top.holdings.find(p => p.id === h.id).value, h.value)
  }
  assert(report.top.metrics.income.netLow < report.input.annualNeed)
  assert(report.top.tradeoffs.some(t => /falls short/.test(t)))
})
test('reserve boundary search can find a feasible transition between coarse 25% steps', () => {
  const { report } = run('CL-0012', { maxTransitionPct: 36 })
  const reserve = report.candidates.find(c => c.id === 'reserve')
  assert.equal(reserve.status, 'review')
  assert(reserve.transitionPct > 25 && reserve.transitionPct <= 36)
})
test('goal-funded core creates client-specific allocations from reserve and account rules', () => {
  const a = run('CL-0003').report.candidates.find(c => c.id === 'goal-core')
  const b = run('CL-0010').report.candidates.find(c => c.id === 'goal-core')
  assert.notDeepEqual(a.sleeves.map(s => s.weight), b.sleeves.map(s => s.weight))
  close(w.sum(a.sleeves, s => s.weight), 100)
  close(w.sum(b.sleeves, s => s.weight), 100)
})
test('cash needs still gate the choice when their ranking weight is zero', () => {
  const { report } = run('CL-0012', { reserveGoal: 1e9, priorities: { liquidity: 0, income: 0, preservation: 0, growth: 5, diversification: 0 } })
  assert.equal(report.top, null)
  assert(report.candidates.every(c => c.blocks.some(g => g.key === 'reserve')))
})
test('ethical or religious data gaps cannot be overridden by a large score', () => {
  for (const rules of [{ ...clearRules, faith: true }, { ...clearRules, gambling: true }]) {
    const { report } = run('CL-0010', { rules, lossLimit: 100, reserveGoal: 0 })
    assert.equal(report.top, null)
    assert(report.candidates.every(c => c.blocks.some(g => g.key === 'values')))
  }
})
test('short horizons block longer-horizon model portfolios', () => {
  const { report } = run('CL-0010', { horizon: 1, reserveGoal: 0, lossLimit: 100 })
  for (const c of report.candidates.filter(c => c.minHorizon > 1)) assert(c.blocks.some(g => g.key === 'horizon'))
})
test('no active numeric or qualitative goals means abstain, not a default product', () => {
  const { report } = run('CL-0010', { priorities: { liquidity: 0, income: 0, preservation: 0, growth: 0, diversification: 0 } })
  assert.equal(report.top, null)
  assert(report.candidates.every(c => c.blocks.some(g => g.key === 'goals')))
  assert(report.candidates.every(c => c.score === null && c.scoreChange === null))
})
test('changing the client name does not change rankings or infer beliefs', () => {
  const { wealth, input, report } = run('CL-0010')
  const renamed = rec.recommendPortfolios({ ...wealth, client: { ...wealth.client, name: 'Different client name' } }, input)
  assert.deepEqual(renamed.candidates.map(c => [c.id, c.score, c.status]), report.candidates.map(c => [c.id, c.score, c.status]))
})
test('account scope is preserved and source/external loans never grow during proposals', () => {
  for (const id of ['CL-0001', 'CL-0012', 'CL-0017']) {
    const { wealth, report } = run(id)
    for (const c of report.candidates) for (const h of wealth.holdings.filter(h => h.accountId !== report.input.accountId || wealth.pledged.has(h.accountId))) {
      close(c.holdings.find(p => p.id === h.id).value, h.value)
    }
  }
  const { report } = run('CL-0001', { accountId: 'PF-0002' })
  assert(report.candidates.filter(c => c.id !== 'retain').every(c => c.amount === 0))
})
test('external examples affect whole-wealth results but never supply a bank-account trade budget', () => {
  const external = [{ id: 'DEMO-rec-test', name: 'Reserve example', model: 'reserve', value: 10000000, debt: 1000000, currency: 'USD' }]
  const baseline = run('CL-0012'), changed = run('CL-0012', {}, external)
  close(baseline.report.eligibleAmount, changed.report.eligibleAmount)
  assert.notEqual(baseline.report.before.worstLoss, changed.report.before.worstLoss)
  const source = changed.wealth.holdings.filter(h => h.external)
  for (const c of changed.report.candidates) for (const h of source) close(c.holdings.find(p => p.id === h.id).value, h.value)
})
test('goal currency follows cash needs, not nationality or only the account base', () => {
  const wealth = w.wealthFor('CL-0006')
  assert.equal(wealth.client.base, 'SGD')
  assert.equal(rec.defaultReserveCurrency(wealth), 'USD')
  const usd = run('CL-0012').report.before.reserveCash
  const hkd = run('CL-0012', { reserveCurrency: 'HKD' }).report.before.reserveCash
  close(usd, 800000); close(hkd, 1152368.76)
})
test('higher requested gross yield cannot improve the unchanged-portfolio income fit', () => {
  const low = run('CL-0012', { targetYield: 2 }).report.candidates.find(c => c.id === 'retain')
  const high = run('CL-0012', { targetYield: 15 }).report.candidates.find(c => c.id === 'retain')
  assert(high.scoreParts.find(p => p.key === 'income').score <= low.scoreParts.find(p => p.key === 'income').score)
  assert(high.tradeoffs.some(t => t.includes('Requested gross yield')))
})
test('zero transition cap creates no sale, negative positions or new capital', () => {
  const { wealth, report } = run('CL-0012', { maxTransitionPct: 0 })
  for (const c of report.candidates) { close(c.amount, 0); close(w.sum(c.holdings, h => h.value), wealth.gross); assert(c.holdings.every(h => h.value >= 0)) }
  assert.equal(report.unscored.length, 6)
  for (const c of report.unscored) {
    assert.equal(c.scoreChange, null)
    assert.equal(c.rank, null)
    assert.match(c.scoreUnavailableReason, /maximum change is set to 0%/)
  }
})
test('funded model mixes have portfolio-specific scores and reconcile to the same baseline', () => {
  const { report } = run('CL-0012')
  const funded = report.candidates.filter(c => c.id !== 'retain' && c.amount > .01)
  assert.equal(funded.length, 6)
  assert(new Set(funded.map(c => c.score.toFixed(2))).size > 1)
  assert(funded.some(c => c.scoreChange > 0))
  for (const c of funded) {
    close(c.scoreChange, c.score - report.baseline.score, 1e-8)
    const componentChange = w.sum(c.scoreParts, part => part.points - report.baseline.scoreParts.find(p => p.key === part.key).points)
    close(c.scoreChange, componentChange, 1e-8)
  }
})
test('goal-fit scores change with the reserve need while unchanged portfolios keep the same risk', () => {
  const priorities = { liquidity: 5, income: 0, preservation: 0, growth: 0, diversification: 0 }
  const lower = run('CL-0012', { priorities, reserveGoal: 2000000 }).report.baseline
  const higher = run('CL-0012', { priorities, reserveGoal: 4000000 }).report.baseline
  // Source cash is USD 800,000. The 90-point cash goal earns 36 vs 18 points,
  // with 10 points for keeping the portfolio. Larger needs must reduce the fit.
  close(lower.score, 46, 1e-8)
  close(higher.score, 28, 1e-8)
  assert.deepEqual(lower.metrics.tests, higher.metrics.tests)
})
test('normalised priorities change score contributions without changing gate thresholds', () => {
  const base = run('CL-0010', { reserveGoal: 0, lossLimit: 100 })
  const changed = run('CL-0010', { reserveGoal: 0, lossLimit: 100, priorities: { liquidity: 0, income: 0, preservation: 5, growth: 0, diversification: 0 } })
  const a = base.report.candidates.find(c => c.id === 'retain'), b = changed.report.candidates.find(c => c.id === 'retain')
  assert.notEqual(a.score, b.score)
  close(b.scoreParts.find(p => p.key === 'preservation').weight, 90)
  assert.deepEqual(a.gates.filter(g => g.key !== 'goals'), b.gates.filter(g => g.key !== 'goals'))
})
