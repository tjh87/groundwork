"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'
import { usePriscilla, priscillaRequest } from './provider'
import { PriscillaAvatar } from './surfaces'

export function PriscillaRail() {
  const priscilla = usePriscilla(), [expanded, setExpanded] = useState(false)
  const rows = expanded ? priscilla.recommendations : priscilla.recommendations.slice(0, 4)
  return <section className="priscilla-rail" aria-label="Today’s Briefing from Priscilla"><div className="priscilla-section-heading"><PriscillaAvatar /><div><p className="priscilla-eyebrow">Priscilla’s next-action queue</p><h2>Today’s Briefing</h2><p>{priscilla.health === 'connecting' ? 'I am checking the client book.' : priscilla.summary ? `I have ${priscilla.recommendations.length} grounded items ready; ${priscilla.summary.urgent} need priority review.` : 'I cannot load the queue yet. Your existing action list remains below.'}</p></div></div><p className="priscilla-source-note">Synthetic snapshot · 26 Aug 2026. These are RM action priorities, not portfolio goal-fit scores or live news.</p>
    {priscilla.error && <div className="priscilla-error" role="alert">{priscilla.error}<button onClick={priscilla.refresh}>Retry</button></div>}
    <div className="priscilla-rail-grid">{rows.map(item => <article key={item.id} className="priscilla-recommendation"><div className="priscilla-rec-heading"><span className={`priscilla-type ${item.type === 'call' || item.type === 'action' ? 'is-urgent' : ''}`}>{item.type}</span><span>{item.score} priority points{item.feedback_boost > 0 ? ' · includes +15 RM preference' : ''}</span></div><h3>{item.client_name}</h3><strong>{item.title}</strong><p>{item.rationale}</p><div className="priscilla-grounding">{item.grounding.map(source => <span key={source}>{source}</span>)}</div><details><summary>Peer context</summary><p>{item.peer_note}</p></details><div className="priscilla-rec-actions"><Link href={`/client/${item.slug}`}>Open client <ArrowRight size={14} /></Link><button onClick={() => priscilla.feedback(item.id, 'accepted')} disabled={Boolean(priscilla.busyItem) || item.feedback === 'accepted'}>{item.feedback === 'accepted' ? <><Check size={14} />Accepted</> : priscilla.busyItem === item.id ? 'Saving…' : 'Accept for review'}</button><button disabled={Boolean(priscilla.busyItem)} onClick={() => priscilla.feedback(item.id, 'dismissed')}>Dismiss</button></div></article>)}</div>
    {priscilla.recommendations.length > 4 && <button className="priscilla-text-button" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show top four' : `Show all ${priscilla.recommendations.length} items`}</button>}
    {priscilla.health === 'connected' && rows.length === 0 && <p>No items remain in this queue. Dismissing an item does not resolve the client risk; source checks remain in each client file.</p>}
    <p className="priscilla-source-note">Accept saves your review preference and adds 15 points once to the same issue category. Dismiss removes the item from this queue. Feedback is saved for your sign-in; it does not approve a trade or change portfolio scores.</p>
  </section>
}
export function PriscillaClientBriefing({ clientId }: { clientId: string }) {
  const [result, setResult] = useState<{ insight: string; grounding: string[] } | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController(); setResult(null); setError('')
    void priscillaRequest<{ insight: string; grounding: string[] }>(`/clients/${clientId}/insight`, undefined, controller.signal).then(setResult).catch(e => { if (!controller.signal.aborted) setError(e.message) })
    return () => controller.abort()
  }, [clientId, retry])
  return <section className="priscilla-inline" aria-label="Priscilla’s Briefing"><div className="priscilla-section-heading"><PriscillaAvatar /><div><p className="priscilla-eyebrow">Before the client conversation</p><h2>Priscilla’s Briefing</h2></div></div>{result ? <><div className="priscilla-inline-text">{result.insight.split('\n\n').map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div><div className="priscilla-grounding">{result.grounding.map(source => <span key={source}>{source}</span>)}</div></> : error ? <div className="priscilla-error" role="alert">{error}<button onClick={() => setRetry(value => value + 1)}>Retry briefing</button></div> : <p role="status">Priscilla is preparing this client’s briefing…</p>}</section>
}
