"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, CircleAlert, GitBranch, Sparkles } from "lucide-react"
import type { ClientProfile, WhyInsight } from "@/lib/types"
import { insights } from "@/lib/data"
import { StressTest } from "./stress-test"
import { WhyPanel } from "./why-panel"
import { WholeWealth } from "./whole-wealth"
import { PriscillaClientBriefing } from "./priscilla/inline"
import { ClientSection, ClientWorkspace } from "./client-sections"

export function ClientBrief({ client }: { client: ClientProfile }) {
  const [selected, setSelected] = useState<WhyInsight>()
  const [open, setOpen] = useState(false)
  const clientInsights = client.insightIds.map((id) => insights[id])
  const inspect = (insight: WhyInsight) => { setSelected(insight); setOpen(true) }
  return <main id="client-brief" className="client-brief-page mx-auto max-w-[1480px] scroll-mt-24 px-5 py-8 lg:px-8 lg:py-10">
    <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Morning list</Link>
    <header className="mt-7 grid gap-6 border-b border-border pb-8 lg:grid-cols-[1fr_0.9fr]">
      <div><div className="flex flex-wrap items-center gap-2"><span className="rule-chip">{client.id}</span><span className={client.priority === "Action" ? "severity-critical" : "severity-high"}>{client.priority}</span><span className="text-xs text-muted-foreground">{client.context}</span></div><h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">{client.name}</h1><p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground"><strong className="text-foreground">Source of wealth:</strong> {client.sourceOfWealth}</p><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground"><strong className="text-foreground">Objective:</strong> {client.objectives}</p></div>
      <div className="grid grid-cols-2 gap-px self-end border border-border bg-border sm:grid-cols-3"><Metric label="AUM" value={client.aum} /><Metric label="Risk" value={client.riskProfile} /><Metric label="Base" value={client.baseCurrency} /><Metric label="Tax domicile" value={client.taxDomicile} /><Metric label="Reporting" value={client.reportingLanguage} /><Metric label="Case review timing" value={client.nextReview === "Today" ? "At snapshot date" : client.nextReview} /></div>
    </header>
    <ClientWorkspace key={client.id} clientId={client.id}>
    <ClientSection id="actions"><PriscillaClientBriefing key={`priscilla-${client.id}`} clientId={client.id} /></ClientSection>
    <WholeWealth key={client.id} clientId={client.id} />
    <ClientSection id="legacy"><div className="wealth-legacy">
      <p className="wealth-small">These fixed case notes preserve the earlier brief. Their figures do not change when you add external examples or edit the whole-wealth model above.</p>
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <section className="brief-block"><div className="flex items-center justify-between"><p className="block-number">01 · What moved</p><span className="rule-chip"><GitBranch className="size-3" />Rule-based</span></div><div className="mt-5 space-y-4">{client.signals.map((signal) => <div key={signal.label} className="grid grid-cols-[1fr_auto] gap-4 border-b border-border pb-4 last:border-0 last:pb-0"><div><p className="text-sm font-medium">{signal.label}</p><p className="mt-1 text-xs text-muted-foreground">{signal.note}</p></div><p className={signal.tone === "critical" ? "signal-critical" : signal.tone === "warn" ? "signal-warn" : "signal-neutral"}>{signal.value}</p></div>)}</div><div className="mt-5 flex flex-wrap gap-2">{clientInsights.map((insight) => <button key={insight.id} onClick={() => inspect(insight)} className="action-secondary">Why: {insight.id.includes("event") ? "event link" : "risk alert"}</button>)}</div></section>
      <section className="brief-block"><div className="flex items-center justify-between"><p className="block-number">02 · Likely ask</p><span className="ai-chip"><Sparkles className="size-3" />Draft narrative</span></div><blockquote className="mt-7 max-w-xl text-xl font-medium leading-8 tracking-tight">“{client.likelyAsk}”</blockquote>{client.clientStance && <div className="meeting-context"><p className="eyebrow">Client stance</p><p>{client.clientStance}</p>{client.rmOpening && <><p className="eyebrow mt-4">Suggested RM opening</p><p className="text-primary">“{client.rmOpening}”</p></>}</div>}<p className="mt-5 text-xs leading-5 text-muted-foreground">Canned narrative based on the supplied RM notes. It does not influence suitability or compliance.</p></section>
      <section className="brief-block"><div className="flex items-center justify-between gap-3"><p className="block-number">03 · One recommended action</p><span className={client.action.status === "GREEN" ? "clearance-green" : "clearance-amber"}>Case check · {client.action.status}</span></div><h2 className="mt-5 text-xl font-semibold tracking-tight">{client.action.title}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{client.action.body}</p><ol className="mt-5 space-y-2">{client.action.steps.map((step, index) => <li key={step} className="flex gap-3 text-sm"><span className="text-xs font-bold text-muted-foreground">0{index + 1}</span><span>{step}</span></li>)}</ol><div className="mt-6 divide-y divide-border border-y border-border">{client.action.checks.map((check) => <div key={check.label} className="flex items-center justify-between gap-4 py-2.5 text-xs"><span className="text-muted-foreground">{check.label}</span><span className="text-right font-medium">{check.value}</span></div>)}</div>{client.intervention && <button onClick={() => inspect(insights["ravi-intervention-why"])} className="action-secondary mt-5">Review intervention logic</button>}</section>
      <section className="brief-block brief-avoid"><div className="flex items-center gap-2"><CircleAlert className="size-4" /><p className="block-number">04 · Do not raise</p></div><h2 className="mt-6 text-xl font-semibold tracking-tight">{client.avoid.title}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{client.avoid.reason}</p>{clientInsights[0] && <button onClick={() => inspect(clientInsights[0])} className="mt-7 inline-flex items-center gap-2 text-xs font-semibold">See the rejection logic <ArrowRight className="size-3.5" /></button>}</section>
    </div>
    <StressTest scenarios={client.scenarios} allocationTitle={client.allocationTitle} allocation={client.allocation} intervention={client.intervention} />
    </div></ClientSection>
    </ClientWorkspace>
    <WhyPanel insight={selected} open={open} onOpenChange={setOpen} />
  </main>
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="bg-card p-3"><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p></div>
}
