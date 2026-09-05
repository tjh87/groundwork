"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { clientDirectory } from '@/lib/data'
import { clientLinksFor, type ClientLink } from '@/lib/priscilla/client-links'
import type { FeedbackAction, PriscillaRecommendation, ScanSummary } from '@/lib/priscilla/engine'

import type { DecisionTrace } from "@/lib/observability"

type Message = { id: string; role: 'user' | 'priscilla'; text: string; client_links?: ClientLink[]; trace?: DecisionTrace }
type Note = { id: string; text: string; scope: 'client' | 'book'; client_links?: ClientLink[] }
// Resolve client IDs against the app directory; never navigate to a URL from reply text.
const replyLinks = (links?: ClientLink[]) => clientLinksFor(Array.isArray(links) ? links.map(link => link?.client_id) : [])
type Health = 'connecting' | 'connected' | 'disconnected'
type State = {
  recommendations: PriscillaRecommendation[]; summary: ScanSummary | null; health: Health; error: string; open: boolean; toast: Note | null;
  messages: Message[]; greeting: string; modelStatus: string; draft: string; typing: boolean; chatError: string; scanning: boolean; busyItem: string;
  client: (typeof clientDirectory)[number] | undefined;
  setOpen: (open: boolean) => void; setDraft: (text: string) => void; dismissToast: () => void; continueToast: () => void;
  send: (message?: string) => Promise<void>; scan: () => Promise<void>; feedback: (id: string, action: FeedbackAction) => Promise<void>; refresh: () => Promise<void>;
}
const PriscillaContext = createContext<State | null>(null)
// Only a UI key, never an identity or authorization token; also works on HTTP previews.
let messageSequence = 0
const messageId = () => `priscilla-${Date.now()}-${++messageSequence}`
export const usePriscilla = () => { const value = useContext(PriscillaContext); if (!value) throw new Error('Priscilla provider missing'); return value }

export async function priscillaRequest<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000) })
  let data
  try { data = await response.json() } catch { throw new Error('Priscilla could not read the response. Please retry.') }
  if (!response.ok || data.error) throw new Error(data.error || 'Priscilla is unavailable. Please retry.')
  return data as T
}

export function PriscillaProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const client = clientDirectory.find(c => pathname === `/client/${c.slug}`)
  const [recommendations, setRecommendations] = useState<PriscillaRecommendation[]>([])
  const [summary, setSummary] = useState<ScanSummary | null>(null)
  const [health, setHealth] = useState<Health>('connecting')
  const [error, setError] = useState('')
  const [open, updateOpen] = useState(false)
  const [toast, setToast] = useState<Note | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [greeting, setGreeting] = useState('')
  const [modelStatus, setModelStatus] = useState('')
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const [chatError, setChatError] = useState('')
  const [scanning, setScanning] = useState(false)
  const [busyItem, setBusyItem] = useState('')
  const openRef = useRef(false), queueRef = useRef(recommendations), timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scanRef = useRef(false), alive = useRef(true), queueVersion = useRef(0), chatAbort = useRef<AbortController | null>(null)
  const contextRef = useRef(client?.id || 'book')
  const briefingScope = useRef<'client' | 'book'>(client ? 'client' : 'book')
  queueRef.current = recommendations

  const dismissToast = useCallback(() => { if (timer.current) clearTimeout(timer.current); timer.current = null; setToast(null) }, [])
  const showNote = useCallback((text: string, scope: 'client' | 'book', client_links?: ClientLink[]) => {
    if (openRef.current || !alive.current) return
    if (timer.current) clearTimeout(timer.current)
    setToast({ id: messageId(), text, scope, client_links: replyLinks(client_links) })
    timer.current = setTimeout(() => { setToast(null); timer.current = null }, 9000)
  }, [])
  const setOpen = useCallback((value: boolean) => { openRef.current = value; updateOpen(value); if (value) dismissToast() }, [dismissToast])
  const refresh = useCallback(async () => {
    const version = ++queueVersion.current
    try {
      const result = await priscillaRequest<{ recommendations: PriscillaRecommendation[]; summary: ScanSummary }>('/recommendations')
      if (!alive.current || version !== queueVersion.current) return
      setRecommendations(result.recommendations); setSummary(result.summary); setHealth('connected'); setError('')
    } catch (e) { if (alive.current && version === queueVersion.current) { setHealth('disconnected'); setError((e as Error).message) } }
  }, [])
  useEffect(() => {
    alive.current = true
    void refresh()
    void priscillaRequest<{ message: string }>('/api/agent').then(result => { if (alive.current) { setGreeting(result.message); setModelStatus('') } }).catch(() => { if (alive.current) setModelStatus('') })
    const ping = setInterval(() => {
      if (document.visibilityState === 'visible') void priscillaRequest('/api/agent', { type: 'ping', context: {} }).then(() => { if (alive.current) setHealth('connected') }).catch(() => { if (alive.current) setHealth('disconnected') })
    }, 30000)
    return () => { alive.current = false; clearInterval(ping); if (timer.current) clearTimeout(timer.current); chatAbort.current?.abort() }
  }, [refresh])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.ctrlKey && !event.altKey && !event.metaKey && event.code === 'Space') { event.preventDefault(); setOpen(!openRef.current) }
      if (event.key === 'Escape' && openRef.current) { event.preventDefault(); setOpen(false) }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [setOpen])
  useEffect(() => {
    dismissToast()
    contextRef.current = client?.id || 'book'
    briefingScope.current = client ? 'client' : 'book'
    chatAbort.current?.abort(); chatAbort.current = null
    setMessages([]); setDraft(''); setTyping(false); setChatError('')
    if (!client) return
    const routeTimer = setTimeout(() => {
      const priority = queueRef.current.some(r => r.client_id === client.id && (r.type === 'call' || r.type === 'action'))
      showNote(`I've opened ${client.name}'s file.${priority ? ` ${client.name.split(' ')[0]} is on the snapshot priority list.` : ''} Shall I brief you?`, 'client', clientLinksFor([client.id]))
    }, 350)
    return () => clearTimeout(routeTimer)
  }, [pathname, client?.id, dismissToast, showNote])

  function continueToast() {
    if (!toast) return
    const message = toast.text
    briefingScope.current = toast.scope
    setMessages([{ id: messageId(), role: 'priscilla', text: message, client_links: toast.client_links }])
    setOpen(true)
  }
  async function send(override?: string) {
    const text = (override ?? draft).trim()
    if (!text || text.length > 1500 || chatAbort.current) return
    const controller = new AbortController(), context = contextRef.current
    chatAbort.current = controller
    setTyping(true); setChatError('')
    setMessages(previous => [...previous, { id: messageId(), role: 'user', text }].slice(-50) as Message[])
    const timeout = setTimeout(() => controller.abort(), 20000)
    try {
      const reply = await priscillaRequest<{ type: string; message: string; client_links?: ClientLink[]; trace?: DecisionTrace }>('/api/agent', { type: 'chat', context: { client_id: client?.id ?? null, briefing_scope: briefingScope.current }, message: text }, controller.signal)
      if (contextRef.current !== context || chatAbort.current !== controller || !alive.current) return
      setMessages(previous => [...previous, { id: messageId(), role: 'priscilla', text: reply.message, client_links: replyLinks(reply.client_links), trace: reply.trace }].slice(-50) as Message[])
      briefingScope.current = /^I would start|^There are no visible/.test(reply.message) ? 'book' : 'client'
      setDraft(''); setHealth('connected')
    } catch (e) {
      if (contextRef.current === context && chatAbort.current === controller && alive.current) { setChatError(['AbortError', 'TimeoutError'].includes((e as Error).name) ? 'The reply timed out. Your message is kept below; retry when ready.' : (e as Error).message); setDraft(text); setHealth('disconnected') }
    } finally { clearTimeout(timeout); if (chatAbort.current === controller) { chatAbort.current = null; setTyping(false) } }
  }
  async function scan() {
    if (scanRef.current) return
    scanRef.current = true; setScanning(true); setError('')
    try {
      const job = await priscillaRequest<{ job_id: string }>('/api/agent', { type: 'scan', context: {} })
      let complete = false
      for (let attempt = 0; attempt < 60 && alive.current; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1000))
        const result = await priscillaRequest<{ type: string; message: string; summary: ScanSummary; client_links?: ClientLink[]; trace?: DecisionTrace }>(`/api/agent/scan/${job.job_id}`)
        if (result.type === 'scan_results') {
          await refresh(); showNote(result.message, 'book', result.client_links)
          if (openRef.current) { briefingScope.current = 'book'; setMessages(previous => [...previous, { id: messageId(), role: 'priscilla', text: result.message, client_links: replyLinks(result.client_links), trace: result.trace }].slice(-50) as Message[]) }
          complete = true; break
        }
      }
      if (!complete && alive.current) throw new Error('The scan is still pending. Please retry; an active scan will be resumed.')
    } catch (e) { if (alive.current) { setError((e as Error).message); setHealth('disconnected') } }
    finally { scanRef.current = false; if (alive.current) setScanning(false) }
  }
  async function feedback(id: string, action: FeedbackAction) {
    if (busyItem) return
    setBusyItem(id); setError('')
    try { await priscillaRequest(`/recommendations/${id}/feedback`, { action }); await refresh() }
    catch (e) { setError(`Feedback was not confirmed: ${(e as Error).message}`); setHealth('disconnected') }
    finally { setBusyItem('') }
  }
  return <PriscillaContext.Provider value={{ recommendations, summary, health, error, open, toast, messages, greeting, modelStatus, draft, typing, chatError, scanning, busyItem, client, setOpen, setDraft, dismissToast, continueToast, send, scan, feedback, refresh }}><div className="priscilla-safe-area">{children}</div></PriscillaContext.Provider>
}
