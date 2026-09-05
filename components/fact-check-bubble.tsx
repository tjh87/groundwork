"use client"

import { useEffect, useRef, useState } from 'react'
import { CircleHelp, Download, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover'
import { EvidenceDiagram } from './evidence-diagram'
import { evidenceDiagram } from '@/lib/evidence-diagram'
import type { Evidence } from '@/lib/calculation-evidence'
import type { DecisionTrace } from '@/lib/observability'
import { modelReviewLabel } from '@/lib/priscilla/model-contract'

function download(name: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type })), link = document.createElement('a')
  link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function FactCheckBubble({ title, derive, revision = '', record: supplied }: { title: string; derive?: () => Evidence; revision?: string; record?: DecisionTrace }) {
  const [open, setOpen] = useState(false), [tab, setTab] = useState('workings'), [record, setRecord] = useState<DecisionTrace | null>(null), [error, setError] = useState(false)
  const factory = useRef(derive); factory.current = derive
  useEffect(() => {
    if (!open) return
    let alive = true
    setRecord(null); setError(false)
    if (supplied) { setRecord(supplied); return }
    void import('@/lib/observability').then(module => module.traceEvidence(() => factory.current!())).then(result => { if (alive) { setRecord(result); setError(!result.evidence) } }).catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [open, revision, supplied])
  const evidence = record?.evidence
  const diagram = evidence ? evidenceDiagram(evidence, record?.model) : ''
  return <Popover open={open} onOpenChange={value => { setOpen(value); if (value) setTab('workings') }}>
    <PopoverTrigger asChild><button type="button" className="fact-trigger" aria-label={`Fact check: ${title}`} title={`How was ${title} derived?`}><CircleHelp size={15} aria-hidden="true" /><span>Fact check</span></button></PopoverTrigger>
    <PopoverContent className="fact-popover" align="end" sideOffset={8} collisionPadding={16} aria-label={`Fact check: ${title}`} onEscapeKeyDown={event => event.stopPropagation()}>
      <div className="fact-header"><div><span className="fact-kicker">Groundwork · evidence</span><h3>{evidence?.title || title}</h3></div><button className="fact-close" onClick={() => setOpen(false)} aria-label="Close fact check"><X size={18} /></button></div>
      {!record && !error && <p role="status">Reading the current inputs and tracing the calculation…</p>}
      {error && <p role="alert">The evidence could not be prepared. The number is not marked as checked. Close this bubble and try again.</p>}
      {evidence && record && <>
        <div className="fact-result"><strong>{evidence.result}</strong><span>Calculation detail: {evidence.exact}</span></div>
        <p className="fact-summary">{evidence.summary}</p>
        <div className="fact-tabs" role="group" aria-label="Evidence views">{[['workings', 'Workings'], ['map', 'Decision map'], ['trace', 'Trace & logs']].map(([id, text]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{text}</button>)}</div>
        {tab === 'workings' && <div className="fact-workings"><h4>Data used</h4><dl>{evidence.inputs.map((input, i) => <div key={i}><dt>{input.label}<em>{input.kind}</em></dt><dd>{input.value}<small>{input.source}</small></dd></div>)}</dl><h4>Calculation</h4><ol>{evidence.workings.map((step, i) => <li key={i}><b>{step.label}</b><code>{step.formula}</code></li>)}</ol><h4>Checks and evidence gaps</h4><ul className="fact-checks">{evidence.checks.map((check, i) => <li key={i} data-status={check.status}><b>{check.status === 'pass' ? 'Checked' : check.status === 'fail' ? 'Needs action' : 'Review'} · {check.label}</b><span>{check.detail}</span></li>)}</ul><h4>Why this matters for the RM</h4><p>{evidence.reason}</p>{evidence.table && <details><summary>Position-level contributions ({evidence.table.rows.length})</summary><div className="fact-table"><table><thead><tr>{evidence.table.columns.map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{evidence.table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody></table></div></details>}<details><summary>Sources and limits</summary><ul>{evidence.sources.map(s => <li key={s}>{s}</li>)}</ul><ul>{evidence.limits.map(s => <li key={s}>{s}</li>)}</ul></details></div>}
        {tab === 'map' && <><EvidenceDiagram code={diagram} /><button className="fact-download" onClick={() => download('groundwork-evidence-map.md', `# ${evidence.title}\n\nSnapshot: ${evidence.sourceDate}\n\n\`\`\`mermaid\n${diagram}\n\`\`\`\n\n${evidence.reason}\n\n${evidence.sources.map(s => '- ' + s).join('\n')}`, 'text/markdown')}><Download size={14} />Export Mermaid for Obsidian</button></>}
        {tab === 'trace' && <div className="fact-trace"><p><b>OpenTelemetry SDK · {record.runtime === 'server' ? 'server execution' : 'calculation replay in this browser'}</b></p><p>{modelReviewLabel(record.model)} Operation success records execution; it does not certify an assumption or approve advice.</p>{record.model?.attempted && <><dl><div><dt>Requested / returned model</dt><dd>{record.model.model} / {record.model.responseModel || 'Not reported'}</dd></div><div><dt>Tokens reported by OpenAI</dt><dd>Input: {record.model.inputTokens ?? 'Not reported'} · Output: {record.model.outputTokens ?? 'Not reported'}</dd></div><div><dt>Request ID</dt><dd>{record.model.requestId || 'Not reported'}</dd></div><div><dt>Evidence digest · SHA-256</dt><dd><code>{record.model.evidenceDigest}</code></dd></div></dl>{!!record.model.selected?.length && <details><summary>Evidence selected by the model</summary><ul>{record.model.selected.map(block => <li key={block.id}><b>{block.id} · {block.label}</b><p>{block.text}</p><small>{block.sources.join('; ')}</small></li>)}</ul></details>}<p>The model selects source passages. Groundwork checks their IDs and renders the original text. This is an evidence trail, not hidden model reasoning or proof that the source data is correct.</p></>}<dl><div><dt>Trace ID</dt><dd><code>{record.id}</code></dd></div><div><dt>Recorded</dt><dd>{record.startedAt}</dd></div><div><dt>Retention</dt><dd>{record.storage === 'saved' ? 'Available for 7 days, latest 100 per RM. Expired records are removed on the next trace write.' : record.storage === 'unavailable' ? 'Server record was not saved. This copy can be downloaded.' : 'This page session only. Download to retain this record.'}</dd></div></dl><ol>{record.spans.map(span => <li key={span.id}><b>{span.name}</b><span>{span.status} · {span.durationMs.toFixed(2)} ms</span><small>Span {span.id}{span.parentId ? ` · parent ${span.parentId}` : ' · root'}</small>{Object.keys(span.attributes).length > 0 && <details><summary>Operation attributes</summary><dl>{Object.entries(span.attributes).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></details>}</li>)}</ol><details><summary>Correlated logs ({record.logs.length})</summary><ul>{record.logs.map((entry, i) => <li key={i}><b>{entry.severity} · {entry.body}</b><small>{entry.at} · {entry.spanId}</small></li>)}</ul></details><button className="fact-download" onClick={() => download(`groundwork-trace-${record.id}.json`, JSON.stringify(record, null, 2), 'application/json')}><Download size={14} />Download trace, logs and evidence</button></div>}
        <p className="fact-footer">Snapshot {evidence.sourceDate} · synthetic case data · {record.version}</p>
      </>}
    </PopoverContent>
  </Popover>
}
