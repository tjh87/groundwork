"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Download, GitBranch, Sparkles } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { appendDecision, exportDecisions, type DecisionType } from "@/lib/ledger"
import type { WhyInsight } from "@/lib/types"

export function WhyPanel({ insight, open, onOpenChange }: { insight?: WhyInsight; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [note, setNote] = useState("")
  const [saved, setSaved] = useState<DecisionType | null>(null)
  const [error, setError] = useState('')
  useEffect(() => { setNote(''); setSaved(null); setError('') }, [insight?.id, open])
  if (!insight) return null

  function record(decision: DecisionType) {
    try {
      appendDecision({ insightId: insight!.id, client: insight!.client, insightTitle: insight!.title, decision, note: note.trim() })
      setSaved(decision); setError(''); setNote('')
    } catch { setSaved(null); setError('The decision was not saved. Your note is still here. Check browser storage and try again.') }
  }

  function exportLedger() {
    try { exportDecisions(); setError('') } catch { setError('The ledger could not be exported. Check browser storage; existing records were kept unchanged.') }
  }

  return <Sheet open={open} onOpenChange={(value) => { onOpenChange(value); if (!value) setSaved(null) }}>
    <SheetContent className="w-full gap-0 overflow-y-auto border-l-border bg-background p-0 sm:max-w-xl">
      <SheetHeader className="border-b border-border px-6 py-6 text-left">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{insight.sourceLabel === "Rule-based" ? <GitBranch className="size-3.5" /> : <Sparkles className="size-3.5" />}{insight.sourceLabel}</div>
        <SheetTitle className="max-w-lg text-2xl leading-tight">{insight.title}</SheetTitle>
        <SheetDescription>{insight.client} · {insight.timestamp}</SheetDescription>
      </SheetHeader>
      <div className="space-y-7 px-6 py-6"><p className="wealth-note">Fixed case explanation from the supplied snapshot. It does not change with draft goals or external examples. Use Recommendations to review the selected portfolio’s current assumptions.</p>
        <section><p className="eyebrow">Trigger and threshold</p><p className="mt-2 text-sm font-medium leading-6">{insight.trigger}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{insight.threshold}</p></section>
        <section><p className="eyebrow">Reasoning chain</p><ol className="mt-3 space-y-3">{insight.chain.map((item, index) => <li key={item} className="flex gap-3 text-sm leading-6"><span className="grid size-6 shrink-0 place-items-center border border-border text-[11px] font-semibold">{index + 1}</span><span>{item}</span></li>)}</ol></section>
        <section><p className="eyebrow">Recommendation</p><p className="mt-2 border-l-2 border-primary pl-4 text-sm font-medium leading-6">{insight.recommendation}</p></section>
        <section><p className="eyebrow">Alternatives and rejections</p><div className="mt-3 divide-y divide-border border-y border-border">{insight.alternatives.map((alternative) => <div key={alternative.label} className="py-3"><div className="flex items-center justify-between gap-4"><p className="text-sm font-medium">{alternative.label}</p><span className={alternative.outcome === "Rejected" ? "status-rejected" : "status-considered"}>{alternative.outcome}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{alternative.reason}</p></div>)}</div></section>
        <section className="grid gap-4 border border-border bg-muted/55 p-4 sm:grid-cols-2"><div><p className="eyebrow">Case assessment</p><p className="mt-1 text-sm font-semibold">{insight.confidence}</p></div><div><p className="eyebrow">What changes it</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{insight.changesIt}</p></div><div className="sm:col-span-2"><p className="eyebrow">Provenance</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{insight.provenance}</p></div></section>
        <section><p className="eyebrow">RM review · saved in this browser</p><p className="mt-2 text-xs text-muted-foreground">A saved review does not approve advice, send a message or execute a trade.</p><textarea aria-label="RM decision rationale" maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add rationale or modification (optional)" className="mt-3 min-h-24 w-full resize-none border border-input bg-background p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" /><div className="mt-3 grid grid-cols-3 gap-2">{(["Accept", "Modify", "Ignore"] as DecisionType[]).map((decision) => <button key={decision} onClick={() => record(decision)} className={decision === "Accept" ? "decision-primary" : "decision-secondary"}>{decision}</button>)}</div>{error && <p role="alert" className="wealth-warning">{error}</p>}{saved && <p className="mt-3 flex items-center gap-2 text-xs font-medium text-emerald-700"><CheckCircle2 className="size-3.5" />{saved} recorded in the local decision ledger.</p>}<button onClick={exportLedger} className="mt-5 flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"><Download className="size-3.5" />Export ledger JSON</button></section>
      </div>
    </SheetContent>
  </Sheet>
}
