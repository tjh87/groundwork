"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, BellRing, Check, Download, Radio, Search, ShieldAlert, Users } from "lucide-react"
import { clientDirectory, events, insights, morningAlerts, todayActions } from "@/lib/data"
import { exportDecisions, getDecisions } from "@/lib/ledger"
import { getRMActionStates, markRMAction, pushRMAction, type RMActionState } from "@/lib/rm-actions"
import type { RMAction, WhyInsight } from "@/lib/types"
import { WhyPanel } from "./why-panel"
import { snapshot } from "@/lib/wealth-model"
import { PriscillaRail } from "./priscilla/inline"

type Filter = "All" | "Action" | "Watch"

const riskMix = [
  { label: "Concentration", color: "#141E55" },
  { label: "Liquidity", color: "#717899" },
  { label: "Currency", color: "#9FA3B9" },
  { label: "Mandate", color: "#D0D2DD" },
  { label: "Collateral", color: "#007770" },
  { label: "Duration", color: "#AFAA7D" },
].map(item => ({ ...item, value: clientDirectory.filter(client => client.primaryRisk === item.label).length }))

export function MorningList() {
  const [selected, setSelected] = useState<WhyInsight>()
  const [open, setOpen] = useState(false)
  const [ledgerCount, setLedgerCount] = useState(0)
  const [actionStates, setActionStates] = useState<RMActionState[]>([])
  const [feedback, setFeedback] = useState("")
  const [storageWarning, setStorageWarning] = useState('')
  const [sending, setSending] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState<Filter>("All")

  useEffect(() => {
    const refresh = () => {
      setLedgerCount(getDecisions().length); setActionStates(getRMActionStates())
      try { getDecisions(true); getRMActionStates(true); setStorageWarning('') }
      catch { setStorageWarning('Saved reviews or action states could not be read. Counts may be incomplete. Existing records were kept unchanged; check browser storage before relying on this list.') }
    }
    refresh()
    window.addEventListener('advisory-ledger-change', refresh)
    window.addEventListener('advisory-rm-actions-change', refresh)
    window.addEventListener('storage', refresh)
    return () => { window.removeEventListener('advisory-ledger-change', refresh); window.removeEventListener('advisory-rm-actions-change', refresh); window.removeEventListener('storage', refresh) }
  }, [])

  const currentActions = actionStates.filter(item => todayActions.some(action => action.id === item.actionId))
  const completed = currentActions.filter((item) => item.completedAt).length
  const sent = currentActions.filter((item) => item.sentAt).length
  const filteredClients = useMemo(() => clientDirectory.filter((client) => {
    const matchesFilter = filter === "All" || client.priority === filter
    const text = `${client.name} ${client.id} ${client.context} ${client.primaryRisk}`.toLowerCase()
    return matchesFilter && text.includes(query.trim().toLowerCase())
  }), [filter, query])

  function inspect(id: string) { setSelected(insights[id]); setOpen(true) }
  async function notify(action: RMAction) {
    if (sending.includes(action.id)) return
    setSending(current => [...current, action.id])
    try {
      const result = await pushRMAction(action)
      setFeedback(result.delivery === 'browser' ? `Browser reminder displayed. ${result.recorded ? 'The action is flagged in this browser.' : 'The delivery status could not be saved.'}` : `Action flagged here for ${action.client}. No browser notification was delivered.`)
    } catch { setFeedback('The reminder could not be saved. Keep this action open and check browser storage; no reminder was sent.') }
    finally { setSending(current => current.filter(id => id !== action.id)) }
  }
  function complete(actionId: string, isComplete: boolean) {
    try {
      markRMAction(actionId, !isComplete)
      setFeedback(isComplete ? 'Action reopened in this browser.' : 'Action marked complete in this browser. The underlying client risk is not cleared.')
    } catch { setFeedback('The action status was not saved. Check browser storage and try again.') }
  }
  function exportLedger() {
    try { exportDecisions(); setFeedback('Review records exported from this browser.') }
    catch { setFeedback('The ledger could not be exported. Existing records were kept unchanged; check browser storage.') }
  }

  return <main className="mx-auto max-w-[1240px] px-5 py-9 lg:px-8 lg:py-12">
    <div className="flex flex-col justify-between gap-5 border-b border-border pb-8 md:flex-row md:items-end"><div><p className="eyebrow">Priscilla Ong · RM action dashboard</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">Act before clients have to ask.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Four priority actions across a 20-client book. Synthetic case snapshot: 26 Aug 2026. Prices, events and due dates do not refresh automatically.</p></div><button onClick={exportLedger} className="inline-flex h-10 items-center justify-center gap-2 border border-border bg-card px-4 text-xs font-semibold hover:border-foreground/30"><Download className="size-3.5" />Decision ledger · {ledgerCount}</button></div>

    <section className="mt-6 grid border border-border bg-border sm:grid-cols-2 lg:grid-cols-4"><DashboardMetric label="Clients in snapshot" value="20" note="Complete RM book" /><DashboardMetric label="Snapshot priorities" value="4" note="Two critical · two high" active /><DashboardMetric label="Actions flagged" value={String(sent)} note="This browser only" /><DashboardMetric label="Completed" value={`${completed}/4`} note="Saved here · risks still apply" /></section>
    <PriscillaRail />

    <section className="wealth-home-strip"><div><span className="wealth-tag">New · goal-matched recommendations</span><h2>Match the portfolio to the client’s goals before giving advice.</h2><p>Compare options across {snapshot.accounts.length} bank accounts. Each client brief shows goal fit, the reasons for each choice, trade-offs and the constraints that can stop a recommendation.</p></div><Link href="/client/cheung-kwok-wing#whole-wealth" className="action-primary">Review Cheung’s options <ArrowRight className="size-4" /></Link></section>

    <section className="mt-8"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><p className="eyebrow">Snapshot action centre</p><h2 className="mt-1 text-2xl font-normal">Key items to complete</h2></div><p className="text-xs text-muted-foreground">Reminders appear on this device. No remote push, email or background monitoring is connected.</p></div>{storageWarning && <p className="wealth-warning mt-4" role="alert">{storageWarning}</p>}{feedback && <div className="action-feedback" role="status"><BellRing className="size-4" />{feedback}</div>}<div className="mt-4 divide-y divide-border border-y border-border">{todayActions.map((action) => { const state = actionStates.find((item) => item.actionId === action.id); const isComplete = Boolean(state?.completedAt); const alert = morningAlerts.find((item) => item.client === action.client); return <article key={action.id} className={isComplete ? "today-action today-action-complete" : "today-action"}><div className="flex min-w-0 gap-3"><button onClick={() => complete(action.id, isComplete)} aria-label={isComplete ? `Reopen ${action.title}` : `Complete ${action.title}`} className={isComplete ? "action-check action-check-complete" : "action-check"}>{isComplete && <Check className="size-3.5" />}</button><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={action.urgency === "Critical" ? "severity-critical" : "severity-high"}>{action.urgency}</span><span className="text-xs text-muted-foreground">{action.due === 'Today' ? 'Due in source case' : action.due}</span>{state?.sentAt && <span className="rule-chip">{state.delivery === "browser" ? "Browser reminder" : "Flagged here"}</span>}</div><h3 className="mt-2 text-base font-semibold">{action.title}</h3><p className="mt-1 text-sm text-muted-foreground">{action.client}</p><p className="mt-2 max-w-2xl text-xs leading-5 text-muted-foreground">{action.message}</p></div></div><div className="flex flex-wrap gap-2 pl-9 lg:justify-end lg:pl-0"><Link href={`/client/${action.slug}`} className="action-primary">Open brief <ArrowRight className="size-3.5" /></Link><button onClick={() => notify(action)} disabled={isComplete || sending.includes(action.id)} className="action-secondary"><BellRing className="size-3.5" />{sending.includes(action.id) ? "Saving reminder…" : "Remind on this device"}</button>{alert && <button onClick={() => inspect(alert.insightId)} className="action-secondary">Why</button>}</div></article>})}</div></section>

    <section id="client-universe" className="mt-10 scroll-mt-24"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><div className="flex items-center gap-2"><Users className="size-4" /><p className="eyebrow">Full client universe</p></div><h2 className="mt-2 text-2xl font-normal">All 20 client briefs</h2><p className="mt-1 text-xs text-muted-foreground">Every client is now available for risk, scenario, rebalancing, and tax-aware review.</p></div><div className="flex flex-col gap-2 sm:flex-row"><label className="client-search"><Search className="size-3.5" /><span className="sr-only">Search clients</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client or risk" /></label><div className="flex">{(["All", "Action", "Watch"] as Filter[]).map((value) => <button key={value} onClick={() => setFilter(value)} aria-pressed={filter === value} className={filter === value ? "directory-filter-active" : "directory-filter"}>{value}</button>)}</div></div></div><div className="mt-4 overflow-hidden border border-border"><div className="client-directory-head"><span>Client</span><span>Primary risk</span><span>Case review timing</span><span>Status</span><span /></div>{filteredClients.map((client) => <Link key={client.id} href={`/client/${client.slug}`} className="client-directory-row"><div><strong>{client.name}</strong><span>{client.id} · {snapshot.accounts.filter(a => a.clientId === client.id).length} bank account(s) · {client.context}</span></div><span className="risk-chip">{client.primaryRisk}</span><span>{client.nextReview === 'Today' ? 'At snapshot date' : client.nextReview}</span><span className={client.priority === "Action" ? "severity-critical" : "severity-high"}>{client.priority}</span><ArrowRight className="size-4 text-primary" /></Link>)}{filteredClients.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">No clients match this search.</p>}</div></section>

    <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_2fr]"><div className="border border-border bg-[#EFEEE5] p-5"><p className="eyebrow">Primary risk distribution</p><p className="mt-1 text-sm font-medium text-primary">{clientDirectory.length} client primary-risk labels</p><div className="mt-4 flex h-6 overflow-hidden" aria-label="Client primary-risk distribution">{riskMix.map((item) => <div key={item.label} style={{ width: `${item.value / clientDirectory.length * 100}%`, backgroundColor: item.color }} title={`${item.label}: ${item.value}`} />)}</div><div className="mt-4 grid grid-cols-2 gap-2">{riskMix.map((item) => <span key={item.label} className="flex items-center gap-2 text-[11px]"><i className="size-2 not-italic" style={{ backgroundColor: item.color }} />{item.label} <strong>{item.value}</strong></span>)}</div><div className="mt-5 flex gap-3 bg-primary p-4 text-primary-foreground"><ShieldAlert className="mt-0.5 size-4 shrink-0" /><p className="text-xs leading-5"><strong>Control:</strong> scenarios and narratives support RM judgement. Rules, suitability, tax, and product approvals remain separate controls.</p></div></div><div><div className="mb-3 flex items-center gap-2"><Radio className="size-4" /><h2 className="text-sm font-semibold">Event radar · supplied case events</h2></div><div className="grid gap-3 md:grid-cols-3">{events.map((event) => <article key={event.id} className="border border-border bg-card p-4"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold tracking-[0.14em] text-muted-foreground">{event.date}</span><span className="risk-chip">{event.affected}</span></div><h3 className="mt-3 text-sm font-semibold leading-5">{event.event}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{event.transmission}</p><div className="mt-4 border-t border-border pt-3"><p className="text-xs font-medium leading-5">{event.idea}</p><button onClick={() => inspect(event.insightId)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">Open event chain <ArrowRight className="size-3" /></button></div></article>)}</div></div></section>
    <WhyPanel insight={selected} open={open} onOpenChange={setOpen} />
  </main>
}

function DashboardMetric({ label, value, note, active = false }: { label: string; value: string; note: string; active?: boolean }) {
  return <div className={active ? "metric-panel metric-panel-active" : "metric-panel"}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
}
