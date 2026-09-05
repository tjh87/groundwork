// Rebuild with: node scripts/import-wealth.mjs (JSON on stdout).
// The input is the supplied synthetic hackathon dataset, not live bank data.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '../data/wealth-source')
const asOf = '2026-08-26'
function csv(name) {
  const text = readFileSync(resolve(root, name + '.csv'), 'utf8').replace(/^\uFEFF/, '')
  const rows = []; let row = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') { if (quoted && text[i + 1] === '"') { field += '"'; i++ } else quoted = !quoted }
    else if (ch === ',' && !quoted) { row.push(field); field = '' }
    else if (ch === '\n' && !quoted) { row.push(field.replace(/\r$/, '')); if (row.some(Boolean)) rows.push(row); row = []; field = '' }
    else field += ch
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row) }
  assert(!quoted, `Unclosed CSV field in ${name}`)
  const header = rows.shift()
  return rows.map(values => { assert.equal(values.length, header.length, name); return Object.fromEntries(header.map((key, i) => [key, values[i]])) })
}
const number = value => value === '' ? null : Number(value)
const sum = (rows, key) => rows.reduce((total, r) => total + r[key], 0)
const sourceClients = csv('clients'), sourceAccounts = csv('portfolios')
const market = csv('market_context').filter(r => r.snapshot_date === asOf)
const fx = { USD: 1 }
for (const r of market.filter(r => r.category === 'FX')) {
  if (r.series_id.startsWith('USD')) fx[r.series_id.slice(3)] = 1 / Number(r.value)
  else if (r.series_id.endsWith('USD')) fx[r.series_id.slice(0, 3)] = Number(r.value)
}
const toUSD = (value, currency) => { assert(fx[currency], `Missing FX ${currency}`); return Number(value) * fx[currency] }
const instruments = Object.fromEntries(csv('instruments').map(r => [r.instrument_id, r]))
const notes = JSON.parse(readFileSync(resolve(root, 'rm_notes.json'), 'utf8'))
const clients = sourceClients.map(r => ({ id: r.client_id, name: r.client_name, base: r.base_currency, risk: r.risk_profile, horizon: Number(r.investment_horizon_years), sourceOfWealth: r.source_of_wealth, objectives: r.objectives, liquidityNeed: r.liquidity_needs, taxDomicile: r.tax_domicile, notes: notes.filter(n => n.client_id === r.client_id).map(n => ({ id: n.note_id, date: n.note_date, text: n.note })) }))
const accounts = sourceAccounts.map(r => ({ id: r.portfolio_id, clientId: r.client_id, name: r.portfolio_name, mandate: r.mandate_code, mandateName: r.mandate_name, service: r.service_model, base: r.base_currency, benchmark: r.benchmark, value: Number(r.aum_usd_current), source: 'Supplied bank snapshot', external: false }))
const holdings = csv('holdings').filter(r => r.snapshot_date === asOf).map(r => {
  const instrument = instruments[r.instrument_id]; assert(instrument, `Unknown instrument ${r.instrument_id}`)
  return { id: r.portfolio_id + ':' + r.instrument_id, accountId: r.portfolio_id, clientId: r.client_id, instrumentId: r.instrument_id, name: r.instrument_name, asset: r.asset_class, subAsset: r.sub_asset_class, sector: r.sector || 'Unknown', currency: r.instrument_ccy, value: Number(r.market_value_usd), lendingValue: toUSD(r.lending_value_base, r.portfolio_ccy), advanceRate: Number(r.advance_rate_pct), liquidity: r.liquidity_tier, valuationDate: r.valuation_date, cost: r.cost_basis_base === '' ? null : toUSD(r.cost_basis_base, r.portfolio_ccy), excluded: instrument.sustainability_excluded === 'Y', singleName: instrument.concentration_limit_applies === 'Y', underlying: instrument.underlying_reference, external: false }
})
const facilities = csv('credit_facilities').map(r => ({ id: r.facility_id, clientId: r.client_id, accountId: r.collateral_portfolio_id, currency: r.facility_ccy, drawn: toUSD(r['drawn_' + asOf], r.facility_ccy), limit: toUSD(r.credit_limit, r.facility_ccy), lendingValue: toUSD(r['lending_value_' + asOf], r.facility_ccy), trigger: Number(r.margin_call_ltv_pct), rate: Number(r.interest_rate_pct) }))
const needs = csv('planned_cash_needs').map(r => ({ id: r.need_id, clientId: r.client_id, description: r.description, currency: r.currency, amount: Number(r.amount), usd: toUSD(r.amount, r.currency), from: r.due_from, to: r.due_to, recurrence: r.recurrence, certainty: r.certainty }))
const commitments = csv('commitments').map(r => ({ id: r.commitment_id, clientId: r.client_id, accountId: r.portfolio_id, name: r.fund_name, currency: r.currency, uncalled: toUSD(r.uncalled, r.currency), window: r.expected_call_window }))
const mandates = csv('mandates').map(r => ({ code: r.mandate_code, name: r.mandate_name, asset: r.asset_class, min: number(r.min_pct), target: number(r.target_pct), max: number(r.max_pct), singleMax: number(r.max_single_position_pct) }))
for (const [key, rows] of Object.entries({ clients, accounts, holdings, facilities, needs, commitments })) assert.equal(new Set(rows.map(r => r.id)).size, rows.length, `Duplicate ${key}`)
for (const account of accounts) {
  assert(clients.some(c => c.id === account.clientId), account.id)
  const rows = holdings.filter(h => h.accountId === account.id)
  assert(rows.every(h => h.clientId === account.clientId), `Wrong owner ${account.id}`)
  assert(Math.abs(sum(rows, 'value') - account.value) < 0.2, `AUM reconciliation ${account.id}`)
}
for (const c of sourceClients) assert(Math.abs(sum(accounts.filter(a => a.clientId === c.client_id), 'value') - Number(c.total_aum_usd)) < 0.3, `Client reconciliation ${c.client_id}`)
const issues = facilities.flatMap(f => {
  const calculated = sum(holdings.filter(h => h.accountId === f.accountId), 'lendingValue')
  return Math.abs(calculated - f.lendingValue) > 1 ? [{ accountId: f.accountId, kind: 'Lending-value mismatch', source: f.lendingValue, holdings: calculated }] : []
})
assert.equal(clients.length, 20); assert.equal(accounts.length, 24)
process.stdout.write(JSON.stringify({ asOf, fx, clients, accounts, holdings, facilities, needs, commitments, mandates, issues }, null, 2) + '\n')
