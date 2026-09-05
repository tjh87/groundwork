import { accountChecks, allocation, assets, canReshapeHolding, incomeModel, isTech, money, saleConstraints, pct, scenarios, snapshot, stress, sum, valuesScreen, type Asset, type Holding, type ValueRules, type Wealth } from './wealth-model'
export { saleConstraints } from './wealth-model'

export const recommendationVersion = 'goal-match-1.2'
export type GoalKey = 'liquidity' | 'income' | 'preservation' | 'growth' | 'diversification'
export type Priorities = Record<GoalKey, number>
export const goalLabels: Record<GoalKey, string> = { liquidity: 'Fund cash needs', income: 'Support regular income', preservation: 'Limit scenario losses', growth: 'Keep growth participation', diversification: 'Reduce shared concentration' }
export const goalKeys = Object.keys(goalLabels) as GoalKey[]
export type RecommendationInput = { accountId: string; priorities: Priorities; reserveGoal: number; reserveCurrency: string; annualNeed: number; targetYield: number | null; lossLimit: number; horizon: number; incomeMultiplier: number; rules: ValueRules; maxTransitionPct: number }
type Sleeve = { id: 'cash' | 'short-gov' | 'credit' | 'equity' | 'gold'; label: string; asset: Asset; weight: number; sourceId: string }
type ModelPortfolio = { id: string; name: string; purpose: string; minHorizon: number; sleeves: Sleeve[] }
const sleeve = (id: Sleeve['id'], weight: number): Sleeve => {
  const spec = {
    cash: ['Goal-currency cash', 'Cash and Equivalents', 'SYN-CA-0601'],
    'short-gov': ['Short government bonds · USD proxy', 'Fixed Income', 'SYN-FI-0202'],
    credit: ['Investment-grade credit · USD proxy', 'Fixed Income', 'SYN-FI-0203'],
    equity: ['Broad global equity · USD proxy', 'Equity', 'SYN-EQ-0001'],
    gold: ['Gold · USD proxy', 'Commodities', 'SYN-CM-0402'],
  }[id]
  return { id, weight, label: spec[0], asset: spec[1] as Asset, sourceId: spec[2] }
}
// Educational model mixes, not Julius Baer products, house views or approved lists.
export const portfolioModels: ModelPortfolio[] = [
  { id: 'reserve', name: 'Spending reserve', purpose: 'Set aside cash for dated needs while the rest of the wealth remains invested.', minHorizon: 0, sleeves: [sleeve('cash', 100)] },
  { id: 'income', name: 'Income & stability', purpose: 'Balance regular cash distributions with broad equity participation.', minHorizon: 3, sleeves: [sleeve('cash', 15), sleeve('short-gov', 40), sleeve('credit', 20), sleeve('equity', 20), sleeve('gold', 5)] },
  { id: 'balanced', name: 'Balanced global mix', purpose: 'Spread the selected account across cash, bonds, global equity and gold.', minHorizon: 5, sleeves: [sleeve('cash', 10), sleeve('short-gov', 25), sleeve('credit', 15), sleeve('equity', 45), sleeve('gold', 5)] },
  { id: 'growth', name: 'Diversified growth', purpose: 'Keep more broad equity exposure for a longer horizon.', minHorizon: 7, sleeves: [sleeve('cash', 5), sleeve('short-gov', 10), sleeve('credit', 10), sleeve('equity', 70), sleeve('gold', 5)] },
  { id: 'complement', name: 'Defensive complement', purpose: 'Test whether bonds, cash and gold reduce risks already held elsewhere.', minHorizon: 5, sleeves: [sleeve('cash', 20), sleeve('short-gov', 45), sleeve('equity', 25), sleeve('gold', 10)] },
]

export function defaultPriorities(wealth: Wealth): Priorities {
  if (wealth.client.id === 'CL-0002') return { liquidity: 5, income: 0, preservation: 4, growth: 2, diversification: 4 }
  if (wealth.client.id === 'CL-0012') return { liquidity: 4, income: 5, preservation: 5, growth: 1, diversification: 2 }
  const text = wealth.client.objectives.toLowerCase()
  return {
    liquidity: wealth.needs.length ? 4 : 2,
    income: /income|yield|retire|lifestyle/.test(text) ? 5 : 1,
    preservation: /preserv|protect|de-risk|transfer/.test(text) || wealth.client.risk === 'Conservative' ? 5 : 2,
    growth: /growth|grow|long.term|long.horizon|aggressive/.test(text) ? 5 : 2,
    diversification: /diversif|dependence|outside|residual stake/.test(text) ? 5 : 2,
  }
}
export function defaultReserveGoal(wealth: Wealth, annualNeed: number) {
  const deadline = new Date(snapshot.asOf + 'T00:00:00Z'); deadline.setUTCMonth(deadline.getUTCMonth() + 18)
  const dated = wealth.needs.filter(n => n.recurrence === 'One-off' && ['Confirmed', 'Likely'].includes(n.certainty) && n.from <= deadline.toISOString().slice(0, 10) && n.to >= snapshot.asOf)
  return Math.max(0, annualNeed) * 2 + sum(dated, n => n.usd)
}
export function defaultReserveCurrency(wealth: Wealth) {
  return [...wealth.needs].filter(n => !/Conditional|Aspirational/.test(n.certainty)).sort((a, b) => b.usd - a.usd)[0]?.currency || wealth.client.base
}
export function eligiblePositions(wealth: Wealth, accountId: string) {
  return wealth.holdings.filter(h => h.accountId === accountId && canReshapeHolding(wealth, h))
}
export function defaultTargetAccount(wealth: Wealth) {
  return [...wealth.accounts].filter(a => !a.external && a.service !== 'Custody').sort((a, b) => sum(eligiblePositions(wealth, b.id), h => h.value) - sum(eligiblePositions(wealth, a.id), h => h.value))[0]?.id || wealth.accounts[0]?.id || ''
}
const bounded = (n: number, low: number, high: number) => Math.min(high, Math.max(low, Number.isFinite(n) ? n : low))
const ratioScore = (amount: number, target: number) => target > 0 ? bounded(amount / target * 100, 0, 100) : 0

function overlapSector(wealth: Wealth) {
  const context = (wealth.client.sourceOfWealth + ' ' + wealth.client.objectives).toLowerCase()
  if (/software|technology|tech founder/.test(context)) return { name: 'Technology / founder business', matches: isTech }
  if (/shipping/.test(context)) return { name: 'Shipping / source of wealth', matches: (h: Holding) => /shipping|pacific orient/i.test(h.name + ' ' + h.underlying) }
  if (/coal|mining|energy group/.test(context)) return { name: 'Energy / family business', matches: (h: Holding) => h.sector === 'Energy' || /energy|bara nusantara/i.test(h.name + ' ' + h.underlying) }
  if (/property|real estate/.test(wealth.client.sourceOfWealth.toLowerCase())) return { name: 'Property / source of wealth', matches: (h: Holding) => h.sector === 'Real Estate' }
  if (/plantation|palm oil/.test(context)) return { name: 'Plantations / source of wealth', matches: (h: Holding) => /palm|plantation/i.test(h.name + ' ' + h.underlying) }
  return { name: 'Identified technology exposure', matches: isTech }
}
function metrics(wealth: Wealth, holdings: Holding[], input: RecommendationInput) {
  const gross = sum(holdings, h => h.value)
  const policy = wealth.accounts.find(a => a.id === input.accountId)?.mandate || 'BAL'
  const tests = scenarios.filter(s => s.id !== 'delay').map(s => {
    const result = stress(wealth, s.id, policy, holdings)
    return { id: s.id, label: s.label, change: result.change, pct: result.changePct }
  })
  const worst = tests.reduce((a, b) => b.pct < a.pct ? b : a)
  const income = incomeModel(wealth, input.incomeMultiplier, holdings)
  const freeCash = sum(holdings.filter(h => h.asset === 'Cash and Equivalents' && h.liquidity === 'Daily' && !wealth.pledged.has(h.accountId)), h => h.value)
  const reserveCash = sum(holdings.filter(h => h.asset === 'Cash and Equivalents' && h.liquidity === 'Daily' && h.currency === input.reserveCurrency && !wealth.pledged.has(h.accountId)), h => h.value)
  const direct = new Map<string, number>()
  holdings.filter(h => h.singleName).forEach(h => direct.set(h.instrumentId, (direct.get(h.instrumentId) || 0) + h.value))
  const topNamePct = pct(Math.max(0, ...direct.values()), gross)
  const overlap = overlapSector(wealth), overlapPct = pct(sum(holdings.filter(overlap.matches), h => h.value), gross)
  const techPct = pct(sum(holdings.filter(isTech), h => h.value), gross)
  const broadEquityPct = pct(sum(holdings.filter(h => h.asset === 'Equity' && h.sector === 'Diversified'), h => h.value), gross)
  return { gross, tests, worst, worstLoss: Math.max(0, -worst.pct), income, freeCash, reserveCash, topNamePct, overlapPct, overlapLabel: overlap.name, techPct, broadEquityPct }
}
export type RecommendationMetrics = ReturnType<typeof metrics>

function transition(wealth: Wealth, input: RecommendationInput, model: ModelPortfolio, fraction: number) {
  const eligible = eligiblePositions(wealth, input.accountId), ids = new Set(eligible.map(h => h.id))
  const amount = sum(eligible, h => h.value) * fraction
  const holdings = wealth.holdings.map(h => ids.has(h.id) ? { ...h, value: h.value * (1 - fraction), lendingValue: h.lendingValue * (1 - fraction), cost: h.cost === null ? null : h.cost * (1 - fraction) } : { ...h })
  const proposed: Holding[] = model.sleeves.filter(s => amount * s.weight > 0).map(s => {
    const proxy = snapshot.holdings.find(h => h.instrumentId === s.sourceId)!
    const value = amount * s.weight / 100
    return { ...proxy, id: `${input.accountId}:REC-${model.id}-${s.id}`, accountId: input.accountId, clientId: wealth.client.id, name: s.id === 'cash' ? input.reserveCurrency + ' cash planning sleeve' : s.label, instrumentId: s.id === 'cash' ? 'REC-CASH-' + input.reserveCurrency : s.sourceId, currency: s.id === 'cash' ? input.reserveCurrency : proxy.currency, value, lendingValue: 0, advanceRate: 0, cost: value, excluded: false, singleName: false, underlying: '', valuationDate: snapshot.asOf, external: false }
  })
  return { holdings: [...holdings.filter(h => h.value > .001), ...proposed], amount, proposed }
}
function goalFundedModel(wealth: Wealth, input: RecommendationInput): ModelPortfolio {
  const account = wealth.accounts.find(a => a.id === input.accountId)
  const eligible = eligiblePositions(wealth, input.accountId), ids = new Set(eligible.map(h => h.id)), available = sum(eligible, h => h.value)
  const fixed = wealth.holdings.filter(h => h.accountId === input.accountId && !ids.has(h.id))
  const accountTotal = sum(wealth.holdings.filter(h => h.accountId === input.accountId), h => h.value)
  const supported: Asset[] = ['Cash and Equivalents', 'Fixed Income', 'Equity', 'Commodities']
  const bands = supported.map(asset => {
    const rule = snapshot.mandates.find(m => m.code === account?.mandate && m.asset === asset)
    const locked = sum(fixed.filter(h => h.asset === asset), h => h.value)
    return { asset, min: Math.max(0, (rule?.min || 0) * accountTotal / 100 - locked), target: Math.max(0, (rule?.target || 0) * accountTotal / 100 - locked), max: Math.max(0, (rule?.max ?? 100) * accountTotal / 100 - locked) }
  })
  const outsideReserve = sum(wealth.holdings.filter(h => !ids.has(h.id) && h.asset === 'Cash and Equivalents' && h.liquidity === 'Daily' && h.currency === input.reserveCurrency && !wealth.pledged.has(h.accountId)), h => h.value)
  const amounts = bands.map(b => b.asset === 'Cash and Equivalents' ? Math.max(b.min, input.reserveGoal - outsideReserve) : b.min)
  const minimum = sum(amounts, n => n)
  // When requirements cannot fit, leave a fully-funded candidate for failed-gate explanation.
  // Never label the scaled mix as feasible until the independent gates have run.
  if (minimum > available && minimum > 0) amounts.forEach((n, i) => { amounts[i] = n * available / minimum })
  let remainder = available - sum(amounts, n => n)
  for (const property of ['target', 'max'] as const) {
    const deficits = bands.map((b, i) => Math.max(0, Math.min(b[property], b.max) - amounts[i]))
    const total = sum(deficits, n => n), spend = Math.min(remainder, total)
    if (total > 0 && spend > 0) deficits.forEach((d, i) => { amounts[i] += spend * d / total })
    remainder -= spend
  }
  amounts[0] += Math.max(0, remainder)
  const weights = available > 0 ? amounts.map(n => 100 * n / available) : [100, 0, 0, 0]
  return { id: 'goal-core', name: 'Goal-funded core', purpose: 'Fund the draft reserve, then fit the remaining liquid assets to this account’s mandate bands.', minHorizon: weights[2] > .01 ? 5 : weights[1] > .01 ? 3 : 0, sleeves: [sleeve('cash', weights[0]), sleeve('short-gov', weights[1] * .8), sleeve('credit', weights[1] * .2), sleeve('equity', weights[2]), sleeve('gold', weights[3])].filter(s => s.weight > .000001) }
}
export type Gate = { key: string; label: string; pass: boolean; reason: string }
export type ScorePart = { key: GoalKey | 'change'; label: string; weight: number; score: number; points: number; reason: string }
export type PortfolioRecommendation = {
  id: string; name: string; purpose: string; minHorizon: number; sleeves: Sleeve[]; transitionPct: number; amount: number; holdings: Holding[]; metrics: RecommendationMetrics; gates: Gate[]; blocks: Gate[]; score: number | null; scoreUnavailableReason: string | null; scoreChange: number | null; scoreParts: ScorePart[]; rank: number | null; reasons: string[]; tradeoffs: string[]; status: 'review' | 'blocked';
}

function scoreParts(wealth: Wealth, after: RecommendationMetrics, input: RecommendationInput, amount: number): ScorePart[] {
  const account = wealth.accounts.find(a => a.id === input.accountId)
  const growthTarget = snapshot.mandates.find(m => m.code === account?.mandate && m.asset === 'Equity')?.target || 40
  const detail: Record<GoalKey, { score: number; reason: string; active: boolean }> = {
    liquidity: { score: ratioScore(after.reserveCash, input.reserveGoal), reason: `${money(after.reserveCash)} unpledged ${input.reserveCurrency} cash (USD equivalent) against a ${money(input.reserveGoal)} draft reserve. Other currencies do not count without conversion.`, active: input.reserveGoal > 0 },
    income: { score: Math.min(input.annualNeed > 0 ? ratioScore(Math.max(0, after.income.netLow), input.annualNeed) : 100, input.targetYield && input.targetYield > 0 ? ratioScore(after.income.grossYieldLow, input.targetYield) : 100), reason: `${money(after.income.netLow)} lower annual estimate after interest against ${money(input.annualNeed)} need; before fees, tax and lender retention.${input.targetYield && input.targetYield > 0 ? ` Gross yield floor ${after.income.grossYieldLow.toFixed(1)}% vs requested ${input.targetYield}%; the weaker coverage sets the income score.` : ''}`, active: input.annualNeed > 0 || (input.targetYield !== null && input.targetYield > 0) },
    preservation: { score: bounded(100 * (1 - after.worstLoss / Math.max(1, input.lossLimit)), 0, 100), reason: `${after.worstLoss.toFixed(1)}% largest loss in the five price/FX tests vs a ${input.lossLimit}% draft limit. More room to the limit scores higher.`, active: true },
    growth: { score: ratioScore(after.broadEquityPct, growthTarget), reason: `${after.broadEquityPct.toFixed(1)}% broad public equity vs ${growthTarget}% reference equity weight. Measures participation, not expected return.`, active: true },
    diversification: { score: bounded(100 - Math.max(after.topNamePct, after.techPct, after.overlapPct), 0, 100), reason: `Largest measured direct-position, tech or source-of-wealth overlap is ${Math.max(after.topNamePct, after.techPct, after.overlapPct).toFixed(1)}%. Fund look-through is incomplete.`, active: true },
  }
  const total = sum(goalKeys, key => detail[key].active ? bounded(input.priorities[key], 0, 5) : 0)
  const parts: ScorePart[] = goalKeys.map(key => {
    const item = detail[key], weight = total > 0 && item.active ? 90 * bounded(input.priorities[key], 0, 5) / total : 0
    return { key, label: goalLabels[key], weight, score: item.score, points: weight * item.score / 100, reason: item.active ? item.reason : 'No numeric target supplied; excluded from scoring. Ask the client before adding one.' }
  })
  const changeScore = bounded(100 - pct(amount, wealth.gross), 0, 100)
  parts.push({ key: 'change', label: 'Avoid unnecessary changes', weight: total > 0 ? 10 : 0, score: changeScore, points: total > 0 ? changeScore / 10 : 0, reason: `${money(amount)} gross amount reshaped (${pct(amount, wealth.gross).toFixed(1)}% of the whole model). This is not a fee or tax estimate.` })
  return parts
}

function evaluate(wealth: Wealth, input: RecommendationInput, before: RecommendationMetrics, model: ModelPortfolio | null, fraction: number, inputErrors: string[] = []): PortfolioRecommendation {
  const account = wealth.accounts.find(a => a.id === input.accountId)
  const change = model ? transition(wealth, input, model, fraction) : { holdings: wealth.holdings, amount: 0, proposed: [] }
  const after = metrics(wealth, change.holdings, input)
  const checks = account ? accountChecks(account, change.holdings) : ['No target account']
  const rules = valuesScreen(change.holdings, input.rules)
  const constraints = saleConstraints(wealth)
  const hasGoals = inputErrors.length === 0 && goalKeys.some(k => input.priorities[k] > 0 && (k !== 'liquidity' || input.reserveGoal > 0) && (k !== 'income' || input.annualNeed > 0 || (input.targetYield !== null && input.targetYield > 0)))
  const maxBaselineLtv = Math.max(0, ...wealth.facilities.map(f => pct(f.drawn, f.lendingValue) / f.trigger))
  const gates: Gate[] = [
    { key: 'goals', label: 'Usable client goal', pass: hasGoals, reason: inputErrors.length ? inputErrors.join(' ') : hasGoals ? 'At least one goal has a weight and the required numeric target.' : 'Set a goal priority and any missing cash or income amount.' },
    { key: 'funding', label: 'Funded transition', pass: !model || change.amount > .01, reason: !model ? 'No new transaction proposed. Existing risks still need review.' : change.amount > .01 ? `${money(change.amount)} stays inside ${account?.name}. No debt or sale proceeds are added.` : input.maxTransitionPct === 0 ? 'The maximum change is set to 0%. Increase it to test a funded change; account and client restrictions still apply.' : constraints.noListedSales ? 'Ravi’s source note prohibits listed sales before the expected exit. No unpledged bank account can fund this change.' : 'No eligible assets: collateral, custody, private/gated assets and protected loss positions cannot fund this change.' },
    { key: 'horizon', label: 'Horizon', pass: !model || input.horizon >= model.minHorizon, reason: model ? `${input.horizon} years entered; this demo mix requires at least ${model.minHorizon}. This does not extend a dated payment window.` : 'Keep the existing mix as a reference; review the actual asset horizons.' },
    { key: 'mandate', label: 'Target account rules', pass: Boolean(account && !account.external && account.service !== 'Custody') && checks.length === 0, reason: checks.length ? checks.join('; ') : account?.external || account?.service === 'Custody' ? 'No eligible managed/advisory mandate for this target.' : 'Allocation, eligible single-position and source sustainability checks pass for the target account.' },
    { key: 'reserve', label: 'Goal-currency reserve', pass: input.reserveGoal <= 0 || after.reserveCash + 1 >= input.reserveGoal, reason: input.reserveGoal <= 0 ? 'No active numeric reserve target; this does not mean cash needs are absent.' : `${money(after.reserveCash)} in unpledged ${input.reserveCurrency} cash vs ${money(input.reserveGoal)} draft need (USD equivalents); gap ${money(Math.max(0, input.reserveGoal - after.reserveCash))}.` },
    { key: 'loss', label: 'Whole-wealth loss limit', pass: after.worstLoss <= input.lossLimit + .01, reason: `${after.worstLoss.toFixed(1)}% worst modelled loss (${after.worst.label}) vs ${input.lossLimit}% draft limit. Unchanged external/private assets remain in this test.` },
    { key: 'values', label: 'Client values screen', pass: !input.rules.faith && rules.blocked.length === 0 && rules.unresolved.length === 0, reason: input.rules.faith ? 'The faith-based requirements and screening method are not supplied. Specialist review must include cash, interest and debt; no name-based inference or automatic clearance.' : rules.blocked.length || rules.unresolved.length ? `${rules.blocked.length} source conflicts and ${rules.unresolved.length} unverified positions under the selected values rules. Obtain screening data; weights cannot override this gate.` : rules.active ? 'No selected source flags found. Full product screening still needs confirmation.' : 'No explicit whole-wealth exclusion selected. Confirm preferences; never infer religion.' },
    { key: 'credit', label: 'Current collateral proximity', pass: maxBaselineLtv < .98, reason: maxBaselineLtv >= .98 ? 'A source facility is within 2% of its LTV trigger (relative distance). Demo review control: agree the credit/funding plan before a portfolio proposal.' : 'No source facility is within the demo 2% relative buffer to its trigger. This does not approve borrowing.' },
  ]
  // A model template with no funded transition is not a different portfolio.
  // Never reuse the current portfolio's score as if the template had been applied.
  const unfunded = Boolean(model && change.amount <= .01)
  const scoreUnavailableReason = unfunded ? gates.find(g => g.key === 'funding')!.reason : !hasGoals ? gates.find(g => g.key === 'goals')!.reason : null
  const parts = scoreUnavailableReason === null ? scoreParts(wealth, after, input, change.amount) : []
  const reasons = scoreUnavailableReason ? [scoreUnavailableReason] : parts.filter(p => p.key !== 'change' && p.weight > 0).sort((a, b) => b.points - a.points).slice(0, 3).map(p => `${p.label}: ${p.reason}`)
  const tradeoffs = [
    `${money(change.amount)} is reshaped. Fees, tax lots, FX conversion, product access and client consent must be confirmed.`,
    `Annual income after loan interest changes from ${money(before.income.netLow)}–${money(before.income.netHigh)} to ${money(after.income.netLow)}–${money(after.income.netHigh)} under the same assumptions.`,
    after.worstLoss < before.worstLoss ? `Worst tested loss falls by ${(before.worstLoss - after.worstLoss).toFixed(1)} percentage points. This is not protection against all losses.` : `Worst tested loss changes by ${(after.worstLoss - before.worstLoss).toFixed(1)} percentage points. Goal fit is not a promise of lower risk.`,
  ]
  if (after.income.netLow < input.annualNeed) tradeoffs.push(`Lower income estimate still falls short by ${money(input.annualNeed - after.income.netLow)} a year. Agree how the gap is funded.`)
  if (input.targetYield !== null && after.income.grossYieldLow < input.targetYield) tradeoffs.push(`Requested gross yield is ${input.targetYield}% versus the ${after.income.grossYieldLow.toFixed(1)}% lower model estimate. The target is not met or guaranteed.`)
  if (wealth.external.length) tradeoffs.push('Other-bank accounts are hypothetical examples. Verify them before relying on the combined result.')
  const blocks = gates.filter(g => !g.pass)
  return { id: model?.id || 'retain', name: model?.name || 'Retain current mix', purpose: model?.purpose || 'Test whether a change is needed before proposing transactions.', minHorizon: model?.minHorizon || 0, sleeves: model?.sleeves || [], transitionPct: unfunded ? 0 : fraction * 100, amount: change.amount, holdings: change.holdings, metrics: after, gates, blocks, score: scoreUnavailableReason === null ? sum(parts, p => p.points) : null, scoreUnavailableReason, scoreChange: null, scoreParts: parts, rank: null, reasons, tradeoffs: unfunded ? ['This model mix has not been applied. There is no proposed cash, income or stress result to compare.', 'Use the current portfolio as the baseline and resolve the funding restriction before testing this mix.'] : tradeoffs, status: blocks.length ? 'blocked' : 'review' }
}

export function recommendPortfolios(wealth: Wealth, request: RecommendationInput) {
  const inputErrors: string[] = []
  const check = (label: string, value: number, min: number, max: number) => { if (!Number.isFinite(value) || value < min || value > max) inputErrors.push(`${label} must be a number from ${min} to ${max}.`) }
  check('Reserve goal', request.reserveGoal, 0, 1e10)
  check('Annual cash need', request.annualNeed, 0, 1e9)
  check('Investment horizon', request.horizon, 0, 100)
  check('Loss limit', request.lossLimit, 1, 100)
  check('Maximum change', request.maxTransitionPct, 0, 100)
  check('Income multiplier', request.incomeMultiplier, 0, 1.5)
  if (request.targetYield !== null) check('Requested yield', request.targetYield, 0, 100)
  for (const key of goalKeys) check(goalLabels[key], request.priorities[key], 0, 5)
  if (!Object.hasOwn(snapshot.fx, request.reserveCurrency)) inputErrors.push('Choose a supported reserve currency.')
  if (!wealth.accounts.some(a => a.id === request.accountId && !a.external)) inputErrors.push('Choose a bank account belonging to this client.')
  const input: RecommendationInput = { ...request, targetYield: request.targetYield == null ? null : bounded(request.targetYield, 0, 100), reserveCurrency: Object.hasOwn(snapshot.fx, request.reserveCurrency) ? request.reserveCurrency : wealth.client.base, annualNeed: bounded(request.annualNeed, 0, 1e10), reserveGoal: bounded(request.reserveGoal, 0, 1e10), horizon: bounded(request.horizon, 0, 100), lossLimit: bounded(request.lossLimit, 1, 100), maxTransitionPct: bounded(request.maxTransitionPct, 0, 100), incomeMultiplier: bounded(request.incomeMultiplier, 0, 1.5), priorities: Object.fromEntries(goalKeys.map(k => [k, bounded(request.priorities[k], 0, 5)])) as Priorities }
  const before = metrics(wealth, wealth.holdings, input)
  const fractions = [...new Set([...Array.from({ length: 20 }, (_, i) => (i + 1) / 20), input.maxTransitionPct / 100].filter(n => n > 0 && n <= input.maxTransitionPct / 100))]
  if (!fractions.length) fractions.push(0)
  const better = (a: PortfolioRecommendation, b: PortfolioRecommendation) => (a.blocks.length === 0 ? 0 : 1) - (b.blocks.length === 0 ? 0 : 1) || a.blocks.length - b.blocks.length || (b.score ?? -1) - (a.score ?? -1) || a.amount - b.amount || a.id.localeCompare(b.id)
  let searched = 1
  const models = [...portfolioModels, goalFundedModel(wealth, input)]
  const baseline = evaluate(wealth, input, before, null, 0, inputErrors)
  const candidates = [baseline, ...models.map(model => {
    // Add the exact reserve-funding boundary to the finite 5% search grid.
    const full = metrics(wealth, transition(wealth, input, model, 1).holdings, input)
    const cashChange = full.reserveCash - before.reserveCash
    const boundary = cashChange > 0 ? (input.reserveGoal - before.reserveCash) / cashChange : -1
    const grid = [...new Set([...fractions, ...(boundary > 0 && boundary <= input.maxTransitionPct / 100 ? [boundary] : [])])]
    searched += grid.length
    return grid.map(fraction => evaluate(wealth, input, before, model, fraction, inputErrors)).sort(better)[0]
  })].sort(better)
  for (const candidate of candidates) candidate.scoreChange = candidate.score !== null && baseline.score !== null ? candidate.score - baseline.score : null
  let rank = 0
  for (const candidate of candidates) if (!candidate.blocks.length) candidate.rank = ++rank
  const eligible = candidates.filter(c => c.status === 'review'), blocked = candidates.filter(c => c.status === 'blocked')
  const constraints = saleConstraints(wealth)
  const target = wealth.accounts.find(a => a.id === input.accountId)
  const nextAction = constraints.noListedSales ? 'Agree Ravi’s funding and collateral plan first. Obtain verified outside-bank cash and sale documents; do not assume a higher valuation or settled proceeds.' : !eligible.length ? 'Do not force a portfolio recommendation. Review the failed gates, confirm the client’s goals and obtain missing data. A mandate or preference change needs client agreement.' : eligible[0].id === 'retain' ? 'The existing mix ranks first under these inputs. Confirm the funding schedule and gaps before proposing an unnecessary rebalance.' : `Review ${eligible[0].name} with the RM, then confirm product suitability, tax, dealing rights and client consent before advice.`
  const evidence = [
    { label: 'Client objective', source: `clients.csv · ${wealth.client.id}`, text: wealth.client.objectives },
    { label: 'Source of wealth', source: `clients.csv · ${wealth.client.id}`, text: wealth.client.sourceOfWealth },
    { label: 'Account role', source: `portfolios.csv · ${target?.id || 'unknown'}`, text: target ? `${target.name} · ${target.service} · ${target.mandateName}` : 'Select a target account.' },
    ...wealth.client.notes.slice(-2).map(n => ({ label: 'RM context', source: `rm_notes.json · ${n.id} · ${n.date}`, text: n.text })),
  ]
  return { input, inputErrors, before, baseline, candidates, eligible, blocked, unscored: candidates.filter(c => c.score === null), top: eligible[0] || null, eligibleAmount: sum(eligiblePositions(wealth, input.accountId), h => h.value), nextAction, evidence, constraints, searched }
}

export function recommendationAllocation(wealth: Wealth, input: RecommendationInput, candidate: PortfolioRecommendation) {
  const account = wealth.accounts.find(a => a.id === input.accountId), original = wealth.holdings.filter(h => h.accountId === input.accountId), proposed = candidate.holdings.filter(h => h.accountId === input.accountId)
  return assets.map(asset => ({ asset, current: pct(sum(original.filter(h => h.asset === asset), h => h.value), sum(original, h => h.value)), proposed: pct(sum(proposed.filter(h => h.asset === asset), h => h.value), sum(proposed, h => h.value)), whole: pct(sum(candidate.holdings.filter(h => h.asset === asset), h => h.value), wealth.gross), band: allocation(original, account?.mandate || 'BAL').find(m => m.asset === asset)! }))
}
