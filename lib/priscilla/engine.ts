import cohorts from './cohorts.json'
import { interestEvidence, stressEvidence } from '../calculation-evidence'
import { clientLinksFor } from './client-links'
import { clientDirectory, events } from '../data'
import { accountChecks, exactMoney, incomeModel, money, noSalePreference, pct, scenarios, signedMoney, snapshot, stress, sum, wealthFor } from '../wealth-model'

export type RecommendationType = 'call' | 'action' | 'review' | 'rebalance' | 'propose' | 'data'
export type FeedbackAction = 'accepted' | 'dismissed'
export type PriscillaRecommendation = {
  id: string; type: RecommendationType; title: string; rationale: string; grounding: string[]; peer_note: string; score: number;
  client_id: string; client_name: string; slug: string; kind: string; base_score: number; feedback_boost: number; feedback?: FeedbackAction;
}
export type Feedback = { recommendation_id: string; kind: string; action: FeedbackAction }
export type ScanSummary = { total_clients: number; flagged_clients: number; pending_recommendations: number; top_client: string | null; urgent: number }
export const sourceDate = snapshot.asOf
export const welcome = `Good day. I can help you review the client book, risks and scenarios. I use the supplied ${sourceDate} snapshot; prices and events are not live.`

export function clientActions(clientId: string): PriscillaRecommendation[] {
  const wealth = wealthFor(clientId), directory = clientDirectory.find(c => c.id === clientId)!
  const income = incomeModel(wealth), output: PriscillaRecommendation[] = []
  const add = (kind: string, type: RecommendationType, base_score: number, title: string, rationale: string, grounding: string[]) => output.push({ id: `jf-${sourceDate}-${clientId}-${kind}`, type, title, rationale, grounding, peer_note: '', score: base_score, base_score, feedback_boost: 0, client_id: clientId, client_name: wealth.client.name, slug: directory.slug, kind })
  const credit = wealth.facilities.filter(f => pct(f.drawn, f.lendingValue) >= f.trigger * .98)
  if (credit.length) add('credit', 'call', 100, 'Agree the collateral plan before another draw', credit.map(f => `${f.id}: LTV ${pct(f.drawn, f.lendingValue).toFixed(2)}% against the ${f.trigger}% trigger.`).join(' ') + (noSalePreference(clientId) ? ' Ravi’s no-listed-sales preference remains fixed. Verify available cash and credit approval; the expected secondary is not settled cash.' : ' Confirm repayment or eligible collateral and credit authority before discussing another draw.'), [`credit_facilities.csv: ${credit.map(f => f.id).join(', ')}`, `holdings.csv: ${sourceDate}`, 'demo review control: 2% relative trigger buffer', ...wealth.client.notes.slice(-2).map(n => `rm_notes: ${n.id}`)])
  const accountFlags = wealth.accounts.flatMap(a => accountChecks(a, wealth.holdings).map(flag => `${a.id}: ${flag}`))
  if (accountFlags.length) add('mandate', 'action', 90, 'Review the account mandate flags', `${accountFlags.length} supplied account-rule flags. ${accountFlags.slice(0, 3).join('; ')}. Confirm the remediation route and client consent; no trade is approved.`, ['mandates.csv', `holdings.csv: ${sourceDate}`, ...wealth.accounts.map(a => `portfolios.csv: ${a.id}`)])
  const reserveDeadline = new Date(sourceDate + 'T00:00:00Z'); reserveDeadline.setUTCMonth(reserveDeadline.getUTCMonth() + 18)
  const reserveNeeds = wealth.needs.filter(n => n.recurrence === 'Annual' || (n.recurrence === 'One-off' && ['Confirmed', 'Likely'].includes(n.certainty) && n.from <= reserveDeadline.toISOString().slice(0, 10) && n.to >= sourceDate))
  const currencies = [...new Set(reserveNeeds.map(n => n.currency))]
  const gaps = currencies.map(currency => {
    const needs = reserveNeeds.filter(n => n.currency === currency)
    const need = sum(needs, n => n.usd * (n.recurrence === 'Annual' ? 2 : 1))
    const cash = sum(wealth.holdings.filter(h => h.asset === 'Cash and Equivalents' && h.currency === currency && h.liquidity === 'Daily' && !wealth.pledged.has(h.accountId)), h => h.value)
    return { currency, need, cash, gap: Math.max(0, need - cash), needs }
  }).filter(g => g.gap > 1)
  if (gaps.length) add('liquidity', 'action', 86, 'Confirm the goal-currency funding route', gaps.map(g => `${g.currency} reserve: ${money(g.cash)} cash vs ${money(g.need)} draft need; gap ${money(g.gap)} (USD equivalents).`).join(' ') + ' This tests two years of annual spending plus likely or confirmed one-offs within 18 months, not an agreed client reserve. Other currencies, unapproved borrowing and unsettled exits do not fill the gap.', ['planned_cash_needs.csv: ' + gaps.flatMap(g => g.needs.map(n => n.id)).join(', '), `holdings.csv: ${sourceDate}`, 'demo reserve assumption: two years + dated one-offs'])
  const top = wealth.singleNames[0]
  if (top && pct(top.value, wealth.gross) > 25) add('concentration', 'review', 76, 'Review the largest direct position', `${top.name} is ${pct(top.value, wealth.gross).toFixed(1)}% of included assets (${money(top.value)}). The 25% whole-model flag is a demo review threshold, not a signed household mandate. ${noSalePreference(clientId) ? 'Discuss collateral and funding while preserving the no-sale instruction.' : 'Check source-of-wealth overlap and the client’s willingness to diversify.'}`, [`holdings.csv: ${sourceDate}`, `clients.csv: ${clientId}`, 'demo whole-model concentration threshold: 25%'])
  const tests = scenarios.filter(s => s.id !== 'delay').map(s => ({ ...stress(wealth, s.id, wealth.accounts[0]?.mandate || 'BAL'), label: s.label }))
  const worst = tests.reduce((a, b) => b.changePct < a.changePct ? b : a)
  if (worst.changePct < -15) add('stress', 'review', 68, 'Discuss the loss capacity in stress', `${worst.label}: ${signedMoney(worst.change)} (${worst.changePct.toFixed(1)}%) of included assets. This exceeds the demo 15% limit. A client-agreed percentage tolerance and observed peak-to-trough drawdown are not supplied; do not infer either from the risk score.`, [`holdings.csv: ${sourceDate}`, 'wealth-model: stated hypothetical stress shocks', 'draft loss limit: 15%'])
  if (income.annualNeed > 0 && income.netLow < income.annualNeed) add('income', 'review', 72, 'Review the income expectation gap', `The lower annual income estimate after loan interest is ${money(income.netLow)} against ${money(income.annualNeed)} of source annual needs: gap ${money(income.annualNeed - income.netLow)}. This uses generic cash-distribution assumptions, before fees and tax. Confirm payments and the client’s expected yield; no agreed yield target is supplied.`, ['planned_cash_needs.csv: annual rows', 'wealth-model: income assumptions', `holdings.csv: ${sourceDate}`])
  const suppliedEvents = events.filter(event => event.affected === wealth.client.name.split(' ')[0])
  if (suppliedEvents.length) add('event', 'review', 65, 'Review the supplied event links', suppliedEvents.map(event => `${event.event}: ${event.transmission}.`).join(' ') + ' These are dated synthetic case events, not upcoming or live market news. Recheck the current facts before contacting the client.', suppliedEvents.map(event => `event case: ${event.id} · ${event.date}`))
  if (wealth.stale.length || wealth.missingCost.length || output.length === 0) add('data', 'data', 40, 'Close the evidence gaps before advice', `${wealth.stale.length} source marks are older than 90 days; ${wealth.missingCost.length} positions lack cost basis. Other-bank assets, liabilities and cash-flow-adjusted YTD performance are not verified. Obtain dated records and confirm goals.`, [`holdings.csv: ${sourceDate}`, `clients.csv: ${clientId}`, 'coverage: supplied bank accounts only'])
  return output
}

export function rankActions(raw: PriscillaRecommendation[], feedback: Feedback[] = []) {
  const acceptedKinds = new Set(feedback.filter(f => f.action === 'accepted' && raw.some(r => r.id === f.recommendation_id && r.kind === f.kind)).map(f => f.kind))
  const feedbackById = new Map(feedback.map(f => [f.recommendation_id, f.action]))
  const typedCohorts = cohorts as Record<string, { lifeStage: string; risk: string }>
  return raw.filter(r => feedbackById.get(r.id) !== 'dismissed').map(r => {
    const cohort = typedCohorts[r.client_id]
    const peers = snapshot.clients.filter(c => c.id !== r.client_id && typedCohorts[c.id]?.lifeStage === cohort?.lifeStage && typedCohorts[c.id]?.risk === cohort?.risk)
    const common = peers.filter(c => raw.some(other => other.client_id === c.id && other.kind === r.kind)).length
    const boost = acceptedKinds.has(r.kind) ? 15 : 0
    return { ...r, score: r.base_score + boost, feedback_boost: boost, feedback: feedbackById.get(r.id), peer_note: peers.length ? `${common} of ${peers.length} other clients with the same source life stage and risk profile share this review flag. This describes this synthetic book, not an investment outcome.` : 'No other client has this exact source life-stage and risk profile. No peer signal is available.' }
  }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
}
export function summarise(recommendations: PriscillaRecommendation[]): ScanSummary {
  return { total_clients: snapshot.clients.length, flagged_clients: new Set(recommendations.filter(r => r.type !== 'data').map(r => r.client_id)).size, pending_recommendations: recommendations.filter(r => r.feedback !== 'accepted').length, top_client: recommendations[0]?.client_name ?? null, urgent: recommendations.filter(r => r.type === 'call' || r.type === 'action').length }
}
export function allActions() { return snapshot.clients.flatMap(c => clientActions(c.id)) }
export function clientInsight(clientId: string) {
  const wealth = wealthFor(clientId), actions = clientActions(clientId).sort((a, b) => b.base_score - a.base_score)
  const scenario = noSalePreference(clientId) ? 'technology' : 'correlation'
  const result = stress(wealth, scenario, wealth.accounts[0]?.mandate || 'BAL')
  const driver = result.rows.toSorted((a, b) => a.change - b.change)[0]
  const key = actions[0]?.kind || 'data'
  const risk: Record<string, string> = { credit: 'The pressing risk is collateral capacity close to the lender’s trigger', mandate: 'The pressing risk is a breach of the supplied account mandate rules', liquidity: 'The pressing risk is insufficient free cash in a goal currency under the stated draft reserve test', concentration: 'The pressing risk is the size of the largest direct position across the supplied accounts', stress: 'The pressing risk is the loss under the stated hypothetical stress tests', income: 'The pressing risk is an income estimate below the source annual spending need', event: 'The next review concerns the supplied event links, which require a current fact check', data: 'Missing or stale records limit the strength of any advice' }
  const next: Record<string, string> = { credit: 'confirm eligible collateral, cash and credit authority before another draw', mandate: 'agree a mandate review and obtain consent for any change', liquidity: 'confirm the reserve amount and an available funding route in each goal currency', concentration: 'check business overlap and whether the client will consider diversification', stress: 'confirm the client’s loss capacity and compare the account stress results', income: 'confirm the yield expectation and payment schedule before proposing income options', event: 'verify the current event and its relevance before contacting the client', data: 'obtain dated records and confirm the client’s goals' }
  return [
    `${wealth.client.name} has ${money(wealth.gross)} in ${wealth.accounts.length} supplied bank account(s), with ${money(wealth.debt)} of included debt.`,
    'Cash-flow-adjusted YTD performance is not supplied and cannot be verified from the snapshot.',
    `${driver.account.name} is the main account loss driver in the ${scenarios.find(s => s.id === scenario)!.label} test: ${signedMoney(driver.change)}; this is a hypothetical shock, not observed performance.`,
    `${risk[key]}.`,
    `Next step: ${next[key]}${noSalePreference(clientId) ? ', while preserving Ravi’s no-listed-sales instruction' : ''}.`
  ].join('\n\n')
}
export type AgentContext = { client_id?: string | null; source_date?: string; briefing_scope?: 'client' | 'book' }
export function chatReply(message: string, context: AgentContext, recommendations: PriscillaRecommendation[]) {
  const text = message.toLowerCase()
  const client = snapshot.clients.find(c => c.id === context.client_id)
  const words = new Set(text.match(/[a-z]+/g) || [])
  const named = snapshot.clients.filter(c => text.includes(c.name.toLowerCase()) || words.has(c.name.split(' ')[0].toLowerCase()))
  const selected = named.length === 1 ? named[0] : client
  const acknowledgement = /^(yes|please)[.! ]*$/.test(text)
  if (named.length > 1) return { type: 'chat', client_links: clientLinksFor(named.map(c => c.id)), message: `You named more than one client: ${named.map(c => c.name).join(', ')}. Which client shall I brief or test first?` }
  if (/\bopen\b|\b(?:take|bring|go|jump)(?:\s+me)?\s+to\b/.test(text)) {
    const target = text.trim().replace(/^(?:please\s+)?(?:open|(?:take|bring|go|jump)(?:\s+me)?\s+to)\s+/, '').replace(/[.!?]+$/, '').trim()
    const priorityTarget = /^(?:the )?(?:(?:first|top|highest priority|urgent|next) (?:client|recommendation|action)|client (?:(?:who|that) )?(?:needs?|requires?) attention)$/.test(target)
    const targetId = named[0]?.id || (priorityTarget ? recommendations[0]?.client_id : /^(?:this|the current|current|selected) (?:client|file)$/.test(target) ? client?.id : undefined)
    return targetId ? { type: 'chat', message: 'Use the link below to open the client file and review the next action.', client_links: clientLinksFor([targetId]) } : { type: 'chat', message: 'Which client would you like to open? Use the client’s name, or ask who needs attention. No client was selected.' }
  }
  if (selected && (/brief (this|the) client|brief (me on|ravi|cheung)/.test(text) || (acknowledgement && context.briefing_scope !== 'book') || (named.length === 1 && /brief/.test(text)))) return { type: 'analysis', client_links: clientLinksFor([selected.id]), message: clientInsight(selected.id) + `\n\nSources: clients.csv (${selected.id}), holdings.csv (${sourceDate}), credit_facilities.csv, mandates.csv and RM notes.` }
  if (/brief|who.*call|priority|priorities|next action|recommendation|recommended action|needs?.*attention|requires?.*attention/.test(text) || acknowledgement) {
    const scoped = named.length === 1 || /(?:this|current|selected) client/.test(text) ? recommendations.filter(r => r.client_id === selected?.id) : recommendations
    const ranked = /who.*call/.test(text) ? scoped.filter(r => r.type === 'call' || r.type === 'action') : scoped
    return { type: 'chat', action_ids: ranked.slice(0, 4).map(r => r.id), client_links: clientLinksFor(ranked.slice(0, 4).map(r => r.client_id)), message: ranked.length ? `I would start with ${ranked[0].client_name}.\n\n` + ranked.slice(0, 4).map((r, i) => `${i + 1}. ${r.client_name} — ${r.title}. ${r.rationale}\nSources: ${r.grounding.join('; ')}`).join('\n\n') + '\n\nThese are next-action priorities, not portfolio suitability scores.' : 'There are no visible items in this queue. Dismissal does not clear an underlying risk. Review the source client files and any unresolved controls.' }
  }
  if (/interest|6\.15|5\.15|0\.40|facility rate/.test(text)) {
    if (!selected) return { type: 'chat', message: 'Which client’s loan interest should I explain? Open a client file or include the client’s name.' }
    const evidence = interestEvidence(wealthFor(selected.id), { shockBps: /(?:\+?100\s*bp|100 basis points)/.test(text) ? 100 : 0 })
    return { type: 'analysis', client_links: clientLinksFor([selected.id]), evidence, message: `${selected.name}: ${evidence.result} (${evidence.exact}) annual loan interest.\n\n${evidence.workings.map(step => step.formula).join('\n')}\n\n${selected.id === 'CL-0002' && /5\.15/.test(text) ? 'The supplied facility rate is 6.15%, not 5.15%. ' : ''}Open Fact check for source fields, assumptions and the calculation trace. This is a planning estimate, before fees and tax.` }
  }
  if (/scenario|stress|technology|recession|rates|currency|delay|collateral|ltv|correlation|diversification/.test(text)) {
    if (!selected) return { type: 'chat', message: 'Which client shall I test? Open a client file or include the client’s full name. I will use the supplied holdings and stated scenario assumptions.' }
    if (!/technology|tech|recession|rates|bond|currency|fx|delay|diversif|correlation|collateral|ltv/.test(text)) return { type: 'chat', message: `Which test shall I run for ${selected.name}: technology, recession, rates, currency, correlation, or an exit delay? Each uses the app’s stated hypothetical assumptions.` }
    const wealth = wealthFor(selected.id)
    const id = /recession/.test(text) ? 'recession' : /rates|bond/.test(text) ? 'rates' : /currency|fx/.test(text) ? 'currency' : /delay/.test(text) ? 'delay' : /diversif|correlation/.test(text) ? 'correlation' : 'technology'
    const result = stress(wealth, id, wealth.accounts[0].mandate)
    if (id === 'delay') return { type: 'analysis', evidence: interestEvidence(wealth, { months: 6 }), client_links: clientLinksFor([selected.id]), message: `${selected.name}: the six-month delay test assumes no settled exit or extra loan. Six months of included loan interest is ${exactMoney(incomeModel(wealth).interest / 2)}. An explicit spending budget is needed before a funding gap can be stated. Open Stress & decisions to enter it.\n\nSources: credit_facilities.csv; holdings.csv, ${sourceDate}.` }
    return { type: 'analysis', evidence: stressEvidence(wealth, id, wealth.accounts[0].mandate), client_links: clientLinksFor([selected.id]), message: `${selected.name} — ${scenarios.find(s => s.id === id)!.label}: included assets change by ${signedMoney(result.change)} (${result.changePct.toFixed(2)}%).\n\n` + result.rows.map(row => `${row.account.name}: ${signedMoney(row.change)} (${row.pct.toFixed(2)}%).`).join('\n') + (result.loans.length ? '\n\n' + result.loans.map(f => `${f.id}: stressed LTV ${f.ltv.toFixed(2)}% vs ${f.trigger}% trigger; repayment to trigger ${exactMoney(f.repaymentGap)}. This reaches the trigger, not a prudent buffer.`).join('\n') : '') + `\n\n${scenarios.find(s => s.id === id)!.detail}\nHypothetical scenario, not a forecast. Other-bank gains do not cure collateral automatically.\nSources: holdings.csv, credit_facilities.csv (${sourceDate}); stated wealth-model shocks.` }
  }
  if (/risk/.test(text)) return { type: 'knowledge', message: 'I separate five controls: concentration in a position or shared business exposure; liquid cash in the currency and time it is needed; currency mismatch; each account’s mandate; and collateral capacity at each lender. I also test common losses across accounts.\n\nA strong goal-fit score cannot override a failed mandate, missing screening or a funding restriction. Client-agreed loss tolerance is not inferred from the risk-profile score.\nSource: the app’s account checks, wealth-model scenarios and RecSys gates.' }
  if (/attribution|ytd|performance|driver/.test(text)) return { type: 'analysis', message: 'Verified YTD performance and return attribution are unavailable. Cash-flow-adjusted performance history is not supplied, so I will not call a change in holdings value an investment return. Ask for a client stress scenario to see modelled loss contributions by account.\nSource: supplied holdings snapshots; performance and cash-flow coverage gap.' }
  if (selected && (named.length === 1 || /client|portfolio|file|brief me/.test(text))) return { type: 'analysis', client_links: clientLinksFor([selected.id]), message: clientInsight(selected.id) + `\n\nSources: clients.csv (${selected.id}), holdings.csv (${sourceDate}), credit_facilities.csv, mandates.csv and RM notes.` }
  return { type: 'chat', message: 'I can prepare the ranked briefing, identify who to call, explain risks, or run a named client’s stress scenario. I use the supplied app data and verified calculations. Model evidence selection, when connected, stays within those sources. I do not have a live market feed. Which of these would help?' }
}
