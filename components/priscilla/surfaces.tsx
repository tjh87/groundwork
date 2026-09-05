"use client"

import { useEffect, useRef } from 'react'
import { ArrowRight, ConciergeBell, ScanLine, Send, X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { Dialog, DialogTitle, DialogDescription } from '../ui/dialog'
import { Textarea } from '../ui/textarea'
import { usePriscilla } from './provider'
import { FactCheckBubble } from '../fact-check-bubble'
import { modelReviewLabel } from '@/lib/priscilla/model-contract'

export function PriscillaAvatar({ className = '' }: { className?: string }) {
  return <span className={`priscilla-avatar ${className}`} aria-hidden="true"><ConciergeBell /></span>
}
export function PriscillaScanButton() {
  const priscilla = usePriscilla()
  return <button className={`priscilla-scan ${priscilla.scanning ? 'is-scanning' : ''}`} aria-label="Intelligence Scan" aria-busy={priscilla.scanning} disabled={priscilla.scanning} onClick={priscilla.scan}><ScanLine size={17} /><span className="priscilla-scan-full">{priscilla.scanning ? 'Scanning the book…' : 'Intelligence Scan'}</span><span className="priscilla-scan-short">{priscilla.scanning ? 'Scanning…' : 'Scan'}</span></button>
}
export function PriscillaSurfaces() {
  const priscilla = usePriscilla(), dock = useRef<HTMLButtonElement>(null), input = useRef<HTMLTextAreaElement>(null), log = useRef<HTMLDivElement>(null)
  const urgent = priscilla.recommendations.filter(r => r.type === 'call' || r.type === 'action').length
  useEffect(() => { if (log.current && priscilla.open) log.current.scrollTop = log.current.scrollHeight }, [priscilla.messages, priscilla.typing, priscilla.open])
  return <>
    {priscilla.toast && !priscilla.open && <aside className="priscilla-toast" role="status" aria-live="polite" aria-label="Priscilla’s note"><button className="priscilla-toast-body" onClick={priscilla.continueToast}><PriscillaAvatar /><span>{priscilla.toast.text}</span></button><button className="priscilla-toast-close" onClick={priscilla.dismissToast} aria-label="Dismiss Priscilla’s note"><X size={16} /></button></aside>}
    <button ref={dock} className="priscilla-dock" aria-label={`${priscilla.open ? 'Close' : 'Open'} Priscilla${urgent ? `, ${urgent} urgent items` : ''}`} aria-keyshortcuts="Control+Space" aria-expanded={priscilla.open} aria-controls="priscilla-chat" onClick={() => priscilla.setOpen(!priscilla.open)}><PriscillaAvatar />{urgent > 0 && <span className="priscilla-badge" aria-label={`${urgent} urgent items`}>{urgent}</span>}{priscilla.health !== 'connected' && <span className={`priscilla-health ${priscilla.health}`} aria-label={priscilla.health === 'connecting' ? 'Priscilla is connecting' : 'Priscilla is disconnected'} />}</button>
    <Dialog open={priscilla.open} onOpenChange={priscilla.setOpen} modal={false}>
      <DialogPrimitive.Portal><DialogPrimitive.Content id="priscilla-chat" className="priscilla-panel" onInteractOutside={event => event.preventDefault()} onOpenAutoFocus={event => { event.preventDefault(); input.current?.focus() }} onCloseAutoFocus={event => { event.preventDefault(); dock.current?.focus() }}>
        <div className="priscilla-panel-header"><PriscillaAvatar /><div><DialogTitle>Priscilla — at your service</DialogTitle><DialogDescription>{priscilla.client ? priscilla.client.name : 'The whole client book'}</DialogDescription></div><button aria-label="Close Priscilla chat" onClick={() => priscilla.setOpen(false)}><X size={18} /></button></div>
        <p className="priscilla-context">{priscilla.modelStatus && <>{priscilla.modelStatus} </>}Supplied snapshot. Draft goals and external examples in the workbench are not included in chat.</p>
        <div ref={log} className="priscilla-messages" role="log" aria-label="Conversation with Priscilla" aria-live="polite">
          {priscilla.messages.length === 0 && <><div className="priscilla-message"><PriscillaAvatar /><p>{priscilla.greeting || 'Good day. I am connecting to the client book.'}</p></div><div className="priscilla-empty"><p>Ask me for today’s briefing, portfolio attribution, risks, scenarios, or who to call first.</p><div>{["Today’s briefing", 'Who should I call first?', priscilla.client ? 'Brief this client' : 'Explain the risk checks'].map(query => <button key={query} disabled={priscilla.typing} onClick={() => priscilla.send(query)}>{query}</button>)}</div></div></>}
          {priscilla.messages.map(message => <div key={message.id} className={`priscilla-message ${message.role === 'user' ? 'from-user' : ''}`}>{message.role === 'priscilla' && <PriscillaAvatar />}<div className="priscilla-message-body"><p>{message.text}</p>{message.trace?.model && <details className="priscilla-model-review"><summary>{message.trace.model.status === 'accepted' ? 'Model-selected evidence' : modelReviewLabel(message.trace.model)}</summary><p>{modelReviewLabel(message.trace.model)}</p>{message.trace.model.selected?.map(block => <div key={block.id}><b>{block.label}</b><p>{block.text}</p><small>Source: {block.sources.join('; ')}</small></div>)}<p>Evidence selection does not approve advice. The full figures, checks and caveats remain in Fact check.</p></details>}{message.role === "priscilla" && message.trace?.evidence && <FactCheckBubble title="Priscilla reply" record={message.trace} />}{message.role === 'priscilla' && !!message.client_links?.length && <nav className="priscilla-client-links" aria-label="Client files in this reply">{message.client_links.map(link => <a key={link.client_id} href={link.href} onClick={() => priscilla.setOpen(false)}>Open {link.client_name}<ArrowRight size={14} aria-hidden="true" /></a>)}</nav>}</div></div>)}
          {priscilla.typing && <div className="priscilla-message priscilla-typing" role="status"><PriscillaAvatar /><p>Priscilla is preparing your briefing…</p></div>}
        </div>
        {(priscilla.chatError || priscilla.error || priscilla.health === 'disconnected') && <div className="priscilla-error" role="alert"><p>{priscilla.chatError || priscilla.error || 'The connection is unavailable. Your workbench remains available.'}</p><button onClick={priscilla.refresh}>Retry connection</button></div>}
        <form className="priscilla-compose" onSubmit={event => { event.preventDefault(); void priscilla.send() }}><label htmlFor="priscilla-message" className="sr-only">Message Priscilla</label><Textarea ref={input} id="priscilla-message" value={priscilla.draft} maxLength={1500} placeholder="Ask Priscilla…" onChange={event => priscilla.setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void priscilla.send() } }} /><button type="submit" disabled={!priscilla.draft.trim() || priscilla.typing} aria-label="Send message to Priscilla"><Send size={18} /></button></form>
        <p className="priscilla-footnote">Ctrl+Space opens or closes · Esc closes · No trade or client message is sent.</p>
      </DialogPrimitive.Content></DialogPrimitive.Portal>
    </Dialog>
  </>
}
