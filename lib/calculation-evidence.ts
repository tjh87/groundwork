import { fundingPlan, holdingShock, incomeModel, rebalanceToCash, scenarios, snapshot, stress, sum, type Holding, type ScenarioId, type Wealth } from './wealth-model'
import { facilityInterest } from './finance-math'
export { facilityInterest } from './finance-math'

export const evidenceVersion = 'groundwork-evidence-1'
export type EvidenceCheck = { label: string; status: 'pass' | 'review' | 'fail'; detail: string }
export type Evidence = {
  title: string; summary: string; result: string; exact: string; sourceDate: string;
  inputs: { label: string; value: string; source: string; kind: 'Snapshot' | 'Assumption' | 'RM input' | 'Calculated' }[];
  workings: { label: string; formula: string }[]; checks: EvidenceCheck[];
  reason: string; limits: string[]; sources: string[];
  table?: { columns: string[]; rows: string[][] };
  diagram: 'interest' | 'stress' | 'funding' | 'decision' | 'agent' | 'recommendation';
}
export const usd = (n: number) => Number.isFinite(n) ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : 'Unavailable'
export const million = (n: number) => Number.isFinite(n) ? `USD ${(n / 1e6).toFixed(2)}m` : 'Unavailable'
const reconciles = (label: string, a: number, b: number): EvidenceCheck => ({ label, status: Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < .01 ? 'pass' : 'fail', detail: `Calculated ${usd(a)}; model ${usd(b)}. Tolerance USD 0.01.` })
const base = (wealth: Wealth) => ({ sourceDate: snapshot.asOf, sources: ['holdings.csv → wealth-snapshot.json', `clients.csv: ${wealth.client.id}`], checks: [{ label: 'Source coverage', status: 'review' as const, detail: `Synthetic snapshot, ${snapshot.asOf}. ${wealth.stale.length} marks older than 90 days; ${wealth.external.length} simulated external accounts. Not a live or complete wealth record.` }] })

export function interestEvidence(wealth: Wealth, options: { facilityId?: string; months?: number; shockBps?: number } = {}): Evidence {
  const { facilityId, months = 12, shockBps = 0 } = options
  const facilities = facilityId ? wealth.facilities.filter(f => f.id === facilityId) : wealth.facilities
  if (facilityId && !facilities.length) throw new Error('Facility not found')
  const rows = facilities.map(f => ({ f, result: facilityInterest(f, months, shockBps) }))
  const external = facilityId ? [] : wealth.external.filter(e => e.debt > 0)
  const amount = sum(rows, r => r.result.amount) + sum(external, e => e.debt * .06 * months / 12)
  const model = !facilityId && shockBps === 0 ? incomeModel(wealth).interest * months / 12 : sum(facilities, f => f.drawn * (f.rate / 100 + shockBps / 10000) * (months / 12)) + sum(external, e => e.debt * .06 * months / 12)
  return { ...base(wealth), title: `${months}-month loan interest`, summary: shockBps ? `Source rate plus ${shockBps} basis points, applied to the unchanged draw.` : 'Simple interest on the supplied drawn balance. The percentage is a source input; the cash cost is calculated.', result: million(amount), exact: usd(amount), diagram: 'interest',
    inputs: [...rows.flatMap(({ f, result }) => [
      { label: `${f.id} · drawn balance`, value: usd(f.drawn), source: `credit_facilities.csv: ${f.id} · drawn_${snapshot.asOf} (USD equivalent)`, kind: 'Snapshot' as const },
      { label: `${f.id} · annual rate`, value: `${f.rate.toFixed(2)}%`, source: `credit_facilities.csv: ${f.id} · interest_rate_pct`, kind: 'Snapshot' as const },
      ...(shockBps ? [{ label: 'Rate shock', value: `${shockBps}bp = ${(shockBps / 100).toFixed(2)} percentage points → ${result.rate.toFixed(2)}%`, source: 'Selected scenario; not a quoted future rate', kind: 'Assumption' as const }] : []),
    ]), ...external.map(e => ({ label: `${e.name} · external debt`, value: `${usd(e.debt)} at assumed 6%`, source: `${e.id} · simulated external example`, kind: 'RM input' as const })), { label: 'Period', value: `${months} / 12 years`, source: 'Selected planning period', kind: 'Assumption' }],
    workings: [...rows.map(({ f, result }) => ({ label: f.id, formula: `${usd(f.drawn)} × (${f.rate.toFixed(2)}${shockBps ? ` + ${shockBps} ÷ 100` : ''}) ÷ 100 × ${months} ÷ 12 = ${usd(result.amount)}` })), ...external.map(e => ({ label: e.id, formula: `${usd(e.debt)} × 0.06 × ${months} ÷ 12 = ${usd(e.debt * .06 * months / 12)}` })), { label: 'Display rounding', formula: `${usd(amount)} ÷ 1,000,000 = ${(amount / 1e6).toFixed(6)}m → ${million(amount)}` }],
    checks: [...base(wealth).checks, reconciles('Interest reconciles', amount, model)],
    reason: 'Use the financing cost when sizing cash reserves. A higher facility limit does not reduce the interest on drawn debt or provide eligible collateral.',
    limits: ['Constant principal and rate; simple interest. Fees, compounding, day-count conventions and tax are excluded.', 'The source rate is not a model accuracy score. Verify it against the signed facility terms.', ...(external.length ? ['External debt uses an illustrative 6% rate, not verified bank terms.'] : [])],
    sources: [...facilities.map(f => `credit_facilities.csv: ${f.id}`), 'wealth-model.ts: incomeModel', 'calculation-evidence.ts: facilityInterest'],
  }
}

export function stressEvidence(wealth: Wealth, scenario: ScenarioId, policy: string, holdings: Holding[] = wealth.holdings): Evidence {
  const result = stress(wealth, scenario, policy, holdings), chosen = scenarios.find(s => s.id === scenario)!
  const contributions = holdings.map(h => ({ h, shock: holdingShock(h, scenario, wealth.client.base) }))
  const total = sum(contributions, r => r.h.value * r.shock)
  return { ...base(wealth), title: `${chosen.label} · asset change`, summary: chosen.detail, result: `${million(result.change)} · ${result.changePct.toFixed(2)}%`, exact: usd(result.change), diagram: 'stress',
    inputs: [{ label: 'Included starting assets', value: usd(wealth.gross), source: `${wealth.accounts.length} included accounts; current snapshot once per position`, kind: 'Calculated' }, { label: 'Home currency', value: wealth.client.base, source: `clients.csv: ${wealth.client.id}`, kind: 'Snapshot' }, { label: 'Scenario shocks', value: chosen.detail, source: `wealth-model.ts: holdingShock · ${scenario}`, kind: 'Assumption' }],
    workings: [{ label: 'Position contribution', formula: 'USD position value × assigned scenario shock. Sum positions within each account, then sum all accounts.' }, { label: 'Combined change', formula: `${usd(result.gains)} gains − ${usd(result.losses)} losses = ${usd(result.change)}` }, { label: 'Percentage denominator', formula: `${usd(result.change)} ÷ ${usd(wealth.gross)} × 100 = ${result.changePct.toFixed(6)}%` }, { label: 'After shock', formula: `${usd(wealth.gross)} + (${usd(result.change)}) = ${usd(result.after)}` }, { label: 'Debt FX adjustment', formula: `${usd(result.change)} − (${usd(result.debtChange)} debt change) = ${usd(result.netChange)} net asset change` }],
    checks: [...base(wealth).checks, reconciles('Position contributions reconcile', total, result.change), reconciles('Accounts reconcile', sum(result.rows, r => r.change), result.change)],
    table: { columns: ['Position / account', 'Value · USD', 'Shock', 'Change · USD'], rows: contributions.map(({ h, shock }) => [`${h.name} · ${h.accountId} · ${h.instrumentId}${h.external ? ' · simulated' : ''}`, usd(h.value), `${(shock * 100).toFixed(4)}%`, usd(h.value * shock)]) },
    reason: 'Compare losses across all included accounts before choosing an action. Positive returns elsewhere do not automatically cover a collateral call at this lender.',
    limits: ['Shocks are assumptions, not return forecasts or likelihoods. No empirical correlations or hedge effectiveness are estimated.', 'Structured products use coarse loss proxies; private marks can be stale. FX uses denomination, not full look-through.', scenario === 'delay' ? 'This scenario applies no market loss. Six-month interest and spending are assessed in the separate funding test.' : 'Price shocks exclude fees, tax, transactions and loan interest.'],
  }
}

export function collateralEvidence(wealth: Wealth, scenario: ScenarioId, policy: string, facilityId: string): Evidence {
  const loan = stress(wealth, scenario, policy).loans.find(f => f.id === facilityId)
  if (!loan) throw new Error('Facility not found')
  const lending = sum(wealth.holdings.filter(h => h.accountId === loan.accountId), h => h.lendingValue * (1 + holdingShock(h, scenario, wealth.client.base)))
  return { ...base(wealth), title: `${loan.id} · collateral test`, summary: 'LTV uses after-haircut lending value, following the supplied facility convention.', result: `${loan.ltv.toFixed(2)}% LTV`, exact: `${loan.ltv.toFixed(6)}% · repayment ${usd(loan.repaymentGap)}`, diagram: 'decision',
    inputs: [{ label: 'Source draw', value: usd(wealth.facilities.find(f => f.id === facilityId)!.drawn), source: `credit_facilities.csv: ${loan.id}`, kind: 'Snapshot' }, { label: 'Trigger', value: `${loan.trigger}%`, source: `credit_facilities.csv: ${loan.id}`, kind: 'Snapshot' }, { label: 'Scenario', value: scenarios.find(s => s.id === scenario)!.detail, source: `wealth-model.ts: ${scenario}`, kind: 'Assumption' }],
    workings: [{ label: 'Eligible collateral after shock', formula: `Σ(position lending value × (1 + position shock)) = ${usd(loan.lendingValueAfter)}` }, { label: 'Stressed LTV', formula: `${usd(loan.drawn)} stressed debt ÷ ${usd(loan.lendingValueAfter)} stressed lending value × 100 = ${loan.ltv.toFixed(6)}%` }, { label: 'Repayment to trigger', formula: `max(0, ${usd(loan.drawn)} − ${usd(loan.lendingValueAfter)} × ${loan.trigger} ÷ 100) = ${usd(loan.repaymentGap)}` }, { label: 'Draw capacity', formula: `max(0, min(facility limit less draw, trigger capacity less draw)) = ${usd(loan.headroom)}` }],
    checks: [...base(wealth).checks, reconciles('Collateral contributions reconcile', lending, loan.lendingValueAfter), { label: 'Trigger test', status: loan.ltv >= loan.trigger ? 'fail' : 'pass', detail: `${loan.ltv.toFixed(2)}% compared with ${loan.trigger}%. Passing is not credit approval.` }],
    table: { columns: ['Position', 'Lending value · USD', 'Shock', 'After shock · USD'], rows: wealth.holdings.filter(h => h.accountId === loan.accountId).map(h => [h.name, usd(h.lendingValue), `${(holdingShock(h, scenario, wealth.client.base) * 100).toFixed(4)}%`, usd(h.lendingValue * (1 + holdingShock(h, scenario, wealth.client.base)))]) },
    reason: loan.ltv >= loan.trigger ? 'The scenario breaches the facility trigger. Confirm a repayment or eligible collateral route with credit before another draw.' : 'The scenario remains below the supplied trigger. Confirm a prudent buffer and transfer rights before treating headroom as available cash.',
    limits: ['Advance rates are held constant. The lender can change haircuts.', 'A repayment reaches the trigger, not a prudent buffer. Off-bank gains do not cure this facility.', 'In the home-currency scenario, foreign-currency debt and collateral are both revalued.'], sources: [...base(wealth).sources, `credit_facilities.csv: ${loan.id}`],
  }
}

export function fundingEvidence(wealth: Wealth, spending: number, spendingSource?: string): Evidence {
  const funding = fundingPlan(wealth, spending)
  return { ...base(wealth), title: 'Six-month funding gap', summary: 'Entered bridge spending plus six months of interest, less eligible USD cash.', result: million(funding.gap ?? NaN), exact: usd(funding.gap ?? NaN), diagram: 'funding',
    inputs: [{ label: 'Bridge spending', value: funding.valid ? usd(spending) : 'Unknown or invalid', source: spendingSource || 'Current RM input; excludes interest', kind: spendingSource ? 'Snapshot' : 'RM input' }, { label: 'Annual interest', value: usd(incomeModel(wealth).interest), source: 'Included source facilities; external debt examples at assumed 6%', kind: 'Calculated' }, { label: 'Eligible USD cash', value: usd(funding.availableUSD), source: 'Daily USD cash outside pledged accounts', kind: 'Calculated' }],
    workings: [{ label: 'Six-month carry', formula: `${usd(incomeModel(wealth).interest)} × 6 ÷ 12 = ${usd(funding.interest)}` }, { label: 'Required funds', formula: funding.valid ? `${usd(spending)} + ${usd(funding.interest)} = ${usd(funding.need!)}` : 'Cannot calculate without a valid spending budget.' }, { label: 'Gap', formula: funding.valid ? `max(0, ${usd(funding.need!)} − ${usd(funding.availableUSD)}) = ${usd(funding.gap!)}` : 'Unknown spending is not treated as zero.' }],
    checks: [...base(wealth).checks, { label: 'Spending input', status: funding.valid ? 'pass' : 'fail', detail: funding.valid ? 'Finite USD amount from 0 to 1,000,000,000.' : 'Enter and confirm a six-month budget.' }],
    reason: funding.gap === null ? 'Confirm spending before discussing a funding route.' : funding.gap > 0 ? 'Available USD cash is insufficient under these assumptions. Confirm the funding source without counting an unsettled exit or an unapproved loan.' : 'Modelled cash covers the entered need. Verify ownership, availability and the full payment schedule.',
    limits: ['Other-currency cash is excluded until conversion is modelled. Pledged cash is not treated as free.', 'Future private sale proceeds and new borrowing are not counted. Dated one-offs must be included in the entered budget.'],
    sources: [...base(wealth).sources, ...wealth.facilities.map(f => `credit_facilities.csv: ${f.id}`), ...(spendingSource ? [spendingSource] : [])],
  }
}

export function cashDecisionEvidence(wealth: Wealth, scenario: ScenarioId, policy: string, move: number): Evidence {
  const before = stress(wealth, scenario, policy), action = rebalanceToCash(wealth, move), after = stress(wealth, scenario, policy, action.holdings)
  const evidence = stressEvidence(wealth, scenario, policy, action.holdings)
  return { ...evidence, title: 'Cash move · decision workings', summary: action.reason, result: `${million(after.after - before.after)} stressed asset difference`, exact: usd(after.after - before.after), diagram: 'decision',
    inputs: [...evidence.inputs, { label: 'Requested move', value: `${move}% of eligible unpledged equity`, source: 'Current RM input; sale constraints remain binding', kind: 'RM input' }],
    workings: [{ label: 'Executed in simulation', formula: `Eligible value × ${move} ÷ 100 = ${usd(action.moved)} moved. If a sale constraint blocks the move, this is zero.` }, { label: 'Change in stressed assets', formula: `${usd(after.after)} after action − ${usd(before.after)} current plan = ${usd(after.after - before.after)}` }, ...evidence.workings],
    checks: [...evidence.checks, reconciles('No new assets created', sum(action.holdings, h => h.value), wealth.gross)], reason: action.reason,
    limits: [...evidence.limits, 'A blocked action must have the same results as the current plan. No score or benefit is invented to separate identical portfolios. Account rules, costs, tax and client consent still need review.'],
  }
}
