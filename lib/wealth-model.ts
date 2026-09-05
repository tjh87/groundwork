import raw from './wealth-snapshot.json'
import { facilityInterest } from './finance-math'

export type Asset = 'Cash and Equivalents' | 'Fixed Income' | 'Equity' | 'Alternatives' | 'Commodities' | 'Structured Products'
export type Holding = { id: string; accountId: string; clientId: string; instrumentId: string; name: string; asset: Asset; subAsset: string; sector: string; currency: string; value: number; lendingValue: number; advanceRate: number; liquidity: string; valuationDate: string; cost: number | null; excluded: boolean; singleName: boolean; underlying: string; external: boolean }
export type Account = { id: string; clientId: string; name: string; mandate: string; mandateName: string; service: string; base: string; benchmark: string; value: number; source: string; external: boolean }
export type ExternalAccount = { id: string; name: string; model: 'reserve' | 'technology' | 'property'; value: number; debt: number; currency: string }
export type Facility = { id: string; clientId: string; accountId: string; currency: string; drawn: number; limit: number; lendingValue: number; trigger: number; rate: number }
export type Mandate = { code: string; name: string; asset: Asset; min: number; target: number; max: number; singleMax: number }
export type Client = { id: string; name: string; base: string; risk: string; horizon: number; sourceOfWealth: string; objectives: string; liquidityNeed: string; taxDomicile: string; notes: { id: string; date: string; text: string }[] }
export const snapshot = raw as unknown as Omit<typeof raw, 'holdings' | 'accounts' | 'facilities' | 'mandates' | 'clients'> & { holdings: Holding[]; accounts: Account[]; facilities: Facility[]; mandates: Mandate[]; clients: Client[] }
export const assets: Asset[] = ['Cash and Equivalents', 'Fixed Income', 'Equity', 'Alternatives', 'Commodities', 'Structured Products']
export const sum = <T,>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0)
export const pct = (amount: number, total: number) => total > 0 ? amount / total * 100 : 0
export const money = (value: number) => Number.isFinite(value) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(value === 0 ? 0 : value) : 'Unavailable'
export const exactMoney = (value: number) => Number.isFinite(value) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.abs(value) < .5 ? 0 : value) : 'Unavailable'
export const signedMoney = (value: number) => Number.isFinite(value) ? `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}` : 'Unavailable'
export const isTech = (h: Holding) => h.sector === 'Information Technology' || /Helios|Meridian Semiconductor|Aranya/.test(h.underlying)
export const noSalePreference = (id: string) => id === 'CL-0002'
export const policyTargetTotal = (code: string) => sum(snapshot.mandates.filter(m => m.code === code), m => m.target)

export function externalHoldings(clientId: string, input: ExternalAccount): Holding[] {
  const patterns: Record<ExternalAccount['model'], [string, number][]> = {
    reserve: [['SYN-FI-0201', .35], ['SYN-FI-0202', .25], ['SYN-CM-0402', .2], ['CASH', .2]],
    technology: [['SYN-ST-0103', .6], ['SYN-EQ-0003', .2], ['SYN-AL-0308', .2]],
    property: [['SYN-AL-0307', .8], ['CASH', .2]],
  }
  return patterns[input.model].map(([id, weight]) => {
    const reference = snapshot.holdings.find(h => h.instrumentId === (id === 'CASH' ? 'SYN-CA-0601' : id))!
    return { ...reference, id: input.id + ':' + id, accountId: input.id, clientId, instrumentId: id === 'CASH' ? 'DEMO-CASH-' + input.currency : id, name: id === 'CASH' ? input.currency + ' cash example' : reference.name, currency: id === 'CASH' ? input.currency : reference.currency, value: input.value * weight, lendingValue: 0, advanceRate: 0, valuationDate: snapshot.asOf, cost: null, external: true }
  })
}

export function wealthFor(clientId: string, external: ExternalAccount[] = []) {
  // Each external ID represents one distinct example account, never a second view of a source account.
  if (new Set(external.map(a => a.id)).size !== external.length || external.some(a => !a.id.startsWith('DEMO-') || !Number.isFinite(a.value) || a.value <= 0 || !Number.isFinite(a.debt) || a.debt < 0)) throw new Error('Invalid or duplicate external example')
  const client = snapshot.clients.find(c => c.id === clientId)
  if (!client) throw new Error('Unknown client')
  const accounts: Account[] = [...snapshot.accounts.filter(a => a.clientId === clientId), ...external.map(a => ({ id: a.id, clientId, name: a.name, mandate: '', mandateName: 'Not provided', service: 'External example', base: a.currency, benchmark: 'Not provided', value: a.value, source: 'Simulated • not client-confirmed', external: true }))]
  const holdings = [...snapshot.holdings.filter(h => h.clientId === clientId), ...external.flatMap(a => externalHoldings(clientId, a))]
  const facilities = snapshot.facilities.filter(f => f.clientId === clientId)
  const pledged = new Set([...facilities.map(f => f.accountId), ...external.filter(a => a.debt > 0).map(a => a.id)])
  const debt = sum(facilities, f => f.drawn) + sum(external, a => a.debt)
  const gross = sum(holdings, h => h.value)
  const buckets = [
    { label: 'Daily · unpledged in model', color: '#141E55', value: sum(holdings.filter(h => h.liquidity === 'Daily' && !pledged.has(h.accountId)), h => h.value) },
    { label: 'Daily · collateral account', color: '#717899', value: sum(holdings.filter(h => h.liquidity === 'Daily' && pledged.has(h.accountId)), h => h.value) },
    { label: 'Weekly / monthly dealing', color: '#AFAA7D', value: sum(holdings.filter(h => ['Weekly', 'Monthly'].includes(h.liquidity)), h => h.value) },
    { label: 'Illiquid / gated', color: '#C30C3E', value: sum(holdings.filter(h => !['Daily', 'Weekly', 'Monthly'].includes(h.liquidity)), h => h.value) },
  ]
  const grouped = new Map<string, { name: string; value: number; accounts: Set<string> }>()
  for (const h of holdings.filter(h => h.singleName)) {
    const item = grouped.get(h.instrumentId) ?? { name: h.name, value: 0, accounts: new Set<string>() }
    item.value += h.value; item.accounts.add(h.accountId); grouped.set(h.instrumentId, item)
  }
  return { client, accounts, holdings, facilities, external, pledged, debt, gross, net: gross - debt, bankGross: sum(holdings.filter(h => !h.external), h => h.value), buckets,
    freeCash: sum(holdings.filter(h => h.asset === 'Cash and Equivalents' && h.liquidity === 'Daily' && !pledged.has(h.accountId)), h => h.value),
    tech: sum(holdings.filter(isTech), h => h.value),
    stale: holdings.filter(h => !h.external && (Date.parse(snapshot.asOf) - Date.parse(h.valuationDate)) / 86400000 > 90),
    missingCost: holdings.filter(h => h.cost === null),
    singleNames: [...grouped.values()].sort((a, b) => b.value - a.value),
    needs: snapshot.needs.filter(n => n.clientId === clientId), commitments: snapshot.commitments.filter(n => n.clientId === clientId),
  }
}
export type Wealth = ReturnType<typeof wealthFor>

export function saleConstraints(wealth: Wealth) {
  return { noListedSales: noSalePreference(wealth.client.id), noLossSales: wealth.client.id === 'CL-0012' }
}
export function canReshapeHolding(wealth: Wealth, holding: Holding) {
  const account = wealth.accounts.find(a => a.id === holding.accountId), constraints = saleConstraints(wealth)
  return Boolean(account && !account.external && account.service !== 'Custody' && !holding.external && !wealth.pledged.has(account.id) && !constraints.noListedSales && holding.liquidity === 'Daily' && ['Equity', 'Fixed Income', 'Commodities', 'Cash and Equivalents'].includes(holding.asset) && (!constraints.noLossSales || (holding.cost !== null && holding.value >= holding.cost)))
}

export function allocation(holdings: Holding[], policy: string) {
  const gross = sum(holdings, h => h.value)
  return assets.map(asset => {
    const mandate = snapshot.mandates.find(m => m.code === policy && m.asset === asset)
    const value = sum(holdings.filter(h => h.asset === asset), h => h.value), weight = pct(value, gross)
    return { asset, value, weight, target: mandate?.target ?? 0, min: mandate?.min ?? 0, max: mandate?.max ?? 100, outside: Boolean(mandate && (weight < mandate.min - .05 || weight > mandate.max + .05)) }
  })
}
export function accountChecks(account: Account, holdings: Holding[]) {
  if (account.external || account.service === 'Custody') return []
  const rows = holdings.filter(h => h.accountId === account.id)
  const issues = allocation(rows, account.mandate).filter(a => a.outside).map(a => `${a.asset}: ${a.weight.toFixed(1)}% vs ${a.min}–${a.max}%`)
  const max = snapshot.mandates.find(m => m.code === account.mandate)?.singleMax ?? 100
  const gross = sum(rows, h => h.value)
  rows.filter(h => h.singleName && pct(h.value, gross) > max + .05).forEach(h => issues.push(`${h.name}: ${pct(h.value, gross).toFixed(1)}% > ${max}% single-position limit`))
  if (account.mandate === 'SUSBAL') rows.filter(h => h.excluded).forEach(h => issues.push(`${h.name}: source sustainability exclusion`))
  return issues
}

export const scenarios = [
  { id: 'technology', label: 'Technology reset', why: 'Test founder wealth and public technology together.', detail: 'Tech −25%; broad equity −10%; long government bonds +6%; short government bonds +1%; gold +8%.', horizon: 'Instant shock' },
  { id: 'rates', label: 'Rates +1.5 points', why: 'Test whether the income account can also fall when equities fall.', detail: 'Long government bonds −18%; short government bonds −3%; credit −8%; broad equity −10%; technology −15%; property −15%.', horizon: 'Instant shock' },
  { id: 'recession', label: 'Recession & credit', why: 'Test liquid spending reserves against credit and equity losses.', detail: 'Broad equity −20%; tech −30%; long government bonds +10%; short government bonds +2%; credit −10%; gold +10%.', horizon: 'Instant shock' },
  { id: 'correlation', label: 'Diversification fails', why: 'Challenge the assumption that another account will offset losses.', detail: 'All equity −25%; all bonds −10%; private assets −25%; gold −12%; structured products −30%. Cash flat.', horizon: 'Instant shock' },
  { id: 'currency', label: 'Home currency +10%', why: 'Test spending-currency exposure across all accounts.', detail: 'Non-home-currency assets and debt lose 9.09% in home-currency terms. Prices otherwise unchanged; no assumed hedge.', horizon: 'FX shock' },
  { id: 'delay', label: 'Liquidity event +6 months', why: 'Test a late exit without assuming a sale, higher valuation or new loan.', detail: 'No market-price shock; private capital remains locked. Six months of loan interest plus the entered bridge budget must be funded.', horizon: '6-month funding test' },
] as const
export type ScenarioId = typeof scenarios[number]['id']
export function holdingShock(h: Holding, scenario: ScenarioId, home: string): number {
  if (scenario === 'delay') return 0
  if (scenario === 'currency') return h.currency === home ? 0 : 1 / 1.1 - 1
  if (h.asset === 'Cash and Equivalents') return 0
  if (scenario === 'correlation') return ({ Equity: -.25, 'Fixed Income': -.1, Alternatives: -.25, Commodities: -.12, 'Structured Products': -.3 } as Record<string, number>)[h.asset] ?? 0
  const tech = isTech(h), longBond = /0201|0211/.test(h.instrumentId), gov = h.subAsset === 'Government Bond', gold = h.sector === 'Gold'
  if (h.asset === 'Equity') return scenario === 'technology' ? (tech ? -.25 : -.1) : scenario === 'rates' ? (tech ? -.15 : -.1) : (tech ? -.3 : -.2)
  if (h.asset === 'Fixed Income') return scenario === 'technology' ? (gov ? (longBond ? .06 : .01) : -.03) : scenario === 'rates' ? (gov ? (longBond ? -.18 : -.03) : -.08) : (gov ? (longBond ? .1 : .02) : -.1)
  if (h.asset === 'Commodities') return scenario === 'technology' ? (gold ? .08 : -.05) : scenario === 'rates' ? .05 : (gold ? .1 : -.15)
  if (h.asset === 'Alternatives') return tech ? (scenario === 'technology' ? -.25 : scenario === 'rates' ? -.15 : -.3) : scenario === 'technology' ? -.08 : scenario === 'rates' ? -.15 : -.2
  // A coarse loss proxy, NOT an options/accumulator valuation or full look-through.
  return scenario === 'technology' ? (tech ? -.3 : -.15) : scenario === 'rates' ? -.15 : -.3
}
export function benchmarkHoldings(policy: string, home: string): Holding[] {
  // Never invent the missing allocation: the source ALTS targets sum to 93%.
  if (Math.abs(policyTargetTotal(policy) - 100) > .01) return []
  const proxyIds: Record<Asset, string> = { 'Cash and Equivalents': 'SYN-CA-0601', 'Fixed Income': 'SYN-FI-0203', Equity: 'SYN-EQ-0001', Alternatives: 'SYN-AL-0301', Commodities: 'SYN-CM-0402', 'Structured Products': 'SYN-SP-0501' }
  return snapshot.mandates.filter(m => m.code === policy).map(m => ({ ...snapshot.holdings.find(h => h.instrumentId === proxyIds[m.asset])!, value: m.target, currency: home, external: true }))
}
export function stress(wealth: Wealth, scenario: ScenarioId, policy: string, holdings = wealth.holdings) {
  const home = wealth.client.base
  const rows = wealth.accounts.map(account => {
    const positions = holdings.filter(h => h.accountId === account.id)
    const value = sum(positions, h => h.value), change = sum(positions, h => h.value * holdingShock(h, scenario, home))
    return { account, value, change, after: value + change, pct: pct(change, value) }
  })
  const gains = sum(rows.filter(r => r.change > 0), r => r.change), losses = Math.max(0, -sum(rows.filter(r => r.change < 0), r => r.change))
  const change = gains - losses
  const loans = wealth.facilities.map(f => {
    const positions = holdings.filter(h => h.accountId === f.accountId)
    const lendingValue = sum(positions, h => h.lendingValue * (1 + holdingShock(h, scenario, home)))
    const debtFactor = scenario === 'currency' && f.currency !== home ? 1 / 1.1 : 1
    const drawn = f.drawn * debtFactor
    return { ...f, drawn, beforeLtv: pct(f.drawn, f.lendingValue), lendingValueAfter: lendingValue, ltv: pct(drawn, lendingValue), repaymentGap: Math.max(0, drawn - lendingValue * f.trigger / 100), headroom: Math.max(0, Math.min(f.limit * debtFactor - drawn, lendingValue * f.trigger / 100 - drawn)) }
  })
  const debtChange = sum(wealth.facilities, f => f.drawn * (scenario === 'currency' && f.currency !== home ? 1 / 1.1 - 1 : 0)) + sum(wealth.external, e => e.debt * (scenario === 'currency' && e.currency !== home ? 1 / 1.1 - 1 : 0))
  const proxy = benchmarkHoldings(policy, home)
  const benchmarkPct = proxy.length ? sum(proxy, h => h.value * holdingShock(h, scenario, home)) : null
  return { rows, gains, losses, change, changePct: pct(change, wealth.gross), netChange: change - debtChange, debtChange, loans, benchmarkPct, after: wealth.gross + change }
}

// Illustrative annual cash-distribution assumptions, NOT quoted yields or total returns.
// No private/structured distribution is counted without a supplied payment schedule.
export const yieldAssumptions: Record<Asset, [number, number]> = { 'Cash and Equivalents': [2, 4], 'Fixed Income': [3, 5], Equity: [1, 3], Alternatives: [0, 0], Commodities: [0, 0], 'Structured Products': [0, 0] }
export function incomeModel(wealth: Wealth, multiplier = 1, holdings = wealth.holdings) {
  const low = sum(holdings, h => h.value * yieldAssumptions[h.asset][0] / 100 * multiplier)
  const high = sum(holdings, h => h.value * yieldAssumptions[h.asset][1] / 100 * multiplier)
  const interest = sum(wealth.facilities, f => facilityInterest(f).amount) + sum(wealth.external, e => e.debt * .06)
  const annualNeed = sum(wealth.needs.filter(n => n.recurrence === 'Annual'), n => n.usd)
  return { low, high, interest, netLow: low - interest, netHigh: high - interest, annualNeed, grossYieldLow: pct(low, wealth.gross), grossYieldHigh: pct(high, wealth.gross), unscheduled: sum(holdings.filter(h => ['Alternatives', 'Structured Products'].includes(h.asset)), h => h.value) }
}
export function fundingPlan(wealth: Wealth, spending: number) {
  const valid = Number.isFinite(spending) && spending >= 0 && spending <= 1e9
  const interest = incomeModel(wealth).interest / 2
  const cash = wealth.holdings.filter(h => h.asset === 'Cash and Equivalents' && h.liquidity === 'Daily' && !wealth.pledged.has(h.accountId))
  const availableUSD = sum(cash.filter(h => h.currency === 'USD'), h => h.value)
  const otherCurrencyCash = sum(cash.filter(h => h.currency !== 'USD'), h => h.value)
  const need = valid ? spending + interest : null
  return { valid, interest, availableUSD, otherCurrencyCash, need, gap: need === null ? null : Math.max(0, need - availableUSD) }
}
export type ValueRules = { sustainability: boolean; gambling: boolean; tobacco: boolean; weapons: boolean; faith: boolean }
export function valuesScreen(holdings: Holding[], rules: ValueRules) {
  const blocked = rules.sustainability ? holdings.filter(h => h.excluded) : []
  const needsDetailedScreen = rules.gambling || rules.tobacco || rules.weapons || rules.faith
  const unresolved = needsDetailedScreen ? holdings.filter(h => h.asset !== 'Cash and Equivalents' && !blocked.some(b => b.id === h.id)) : []
  return { blocked, unresolved, active: Object.values(rules).some(Boolean) }
}
export function rebalanceToCash(wealth: Wealth, percentOfEligible: number) {
  if (noSalePreference(wealth.client.id)) return { holdings: wealth.holdings, moved: 0, reason: 'Blocked by Ravi’s stated no-listed-sales preference. Review verified unpledged cash or a credit-approved collateral plan first.' }
  if (!Number.isFinite(percentOfEligible) || percentOfEligible < 0 || percentOfEligible > 20) return { holdings: wealth.holdings, moved: 0, reason: 'Enter an equity move between 0% and 20% before comparing results.' }
  const eligible = (h: Holding) => h.asset === 'Equity' && canReshapeHolding(wealth, h)
  const fraction = Math.min(20, Math.max(0, percentOfEligible)) / 100
  const holdings: Holding[] = [], cash = new Map<string, { reference: Holding; value: number }>()
  let moved = 0
  for (const h of wealth.holdings) {
    const amount = eligible(h) ? h.value * fraction : 0
    moved += amount
    if (amount > 0) {
      const key = h.accountId + ':' + h.currency
      cash.set(key, { reference: h, value: (cash.get(key)?.value ?? 0) + amount })
    }
    holdings.push({ ...h, value: h.value - amount, cost: h.cost === null ? null : h.cost * (1 - (eligible(h) ? fraction : 0)) })
  }
  for (const [key, { reference, value }] of cash) holdings.push({ ...reference, id: key + ':DEMO-REBALANCE-CASH', instrumentId: 'DEMO-REBALANCE-CASH-' + reference.currency, name: reference.currency + ' cash after simulated sale', asset: 'Cash and Equivalents', subAsset: 'Deposit', sector: 'Cash', liquidity: 'Daily', value, cost: value, lendingValue: 0, advanceRate: 0, singleName: false, excluded: false, underlying: '' })
  const protection = saleConstraints(wealth).noLossSales ? ' Cheung’s loss positions and positions with unknown cost stay fixed.' : ''
  return { holdings, moved, reason: (moved > 0 ? 'Move eligible unpledged equities to cash in the same account and currency. Custody, collateral and external examples stay fixed. No FX conversion is assumed; tax and dealing costs are excluded.' : 'No sale is modelled at this setting. Confirm eligible assets and the requested move before proposing a transaction.') + protection }
}
