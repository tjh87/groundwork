"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { ArrowUpRight, ChevronDown, ChevronRight, ListFilter } from 'lucide-react'

const sections = [
  { id: 'actions', label: 'Next actions' },
  { id: 'summary', label: 'Wealth summary' },
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'wealth', label: 'Accounts & liquidity' },
  { id: 'goals', label: 'Goals & values' },
  { id: 'stress', label: 'Stress & decisions' },
  { id: 'evidence', label: 'Evidence & gaps' },
  { id: 'legacy', label: 'Earlier RM brief' },
] as const
type SectionId = (typeof sections)[number]['id']
type WealthView = Exclude<SectionId, 'actions' | 'summary' | 'legacy'>
type SectionState = {
  minimised: SectionId[]; tab: WealthView; ready: boolean;
  toggle: (id: SectionId) => void; selectView: (view: string) => void;
}
const SectionContext = createContext<SectionState | null>(null)
export function useClientSections() {
  const context = useContext(SectionContext)
  if (!context) throw new Error('Client section controls are missing')
  return context
}
const isView = (id: string): id is WealthView => ['recommendations', 'wealth', 'goals', 'stress', 'evidence'].includes(id)

export function ClientWorkspace({ clientId, children }: { clientId: string; children: ReactNode }) {
  const [minimised, setMinimised] = useState<SectionId[]>(['legacy'])
  const [tab, setTab] = useState<WealthView>('recommendations')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const storageKey = `groundwork-client-sections-v1:${clientId}`
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (Array.isArray(saved)) setMinimised(sections.filter(section => saved.includes(section.id)).map(section => section.id))
    } catch { /* View controls also work when browser storage is unavailable. */ }
    setLoaded(true)
  }, [storageKey])
  useEffect(() => {
    if (loaded) try { localStorage.setItem(storageKey, JSON.stringify(minimised)) } catch { /* UI preference only. */ }
  }, [loaded, storageKey, minimised])
  function toggle(id: SectionId) { setMinimised(previous => previous.includes(id) ? previous.filter(value => value !== id) : [...previous, id]) }
  function selectView(view: string) {
    if (!isView(view)) return
    setTab(view)
    setMinimised(previous => previous.filter(id => id !== view))
  }
  function jump(id: SectionId) {
    if (isView(id)) setTab(id)
    setMinimised(previous => previous.filter(value => value !== id))
    setMobileOpen(false)
    requestAnimationFrame(() => {
      const heading = document.getElementById(`client-section-${id}-title`)
      heading?.focus({ preventScroll: true })
      heading?.scrollIntoView({ block: 'start', behavior: 'instant' })
    })
  }
  function focusActions() {
    setMinimised(sections.filter(section => section.id !== 'actions').map(section => section.id))
    jump('actions')
  }
  return <SectionContext.Provider value={{ minimised, tab, toggle, selectView, ready: loaded }}>
    <div className="client-workspace">
      <aside className="client-section-nav" aria-label="Client page sections">
        <div className="client-section-nav-heading"><h2><ListFilter size={17} aria-hidden="true" />Page sections</h2><button className="client-section-mobile-toggle" disabled={!loaded} aria-expanded={mobileOpen} aria-controls="client-section-controls" onClick={() => setMobileOpen(!mobileOpen)}>{mobileOpen ? 'Close' : 'Options'}<ChevronDown size={16} aria-hidden="true" /></button></div>
        <p className="client-section-count" role="status">{loaded ? `${minimised.length} of ${sections.length} sections minimised` : 'Loading view…'}</p>
        <fieldset disabled={!loaded} id="client-section-controls" className={`client-section-controls ${mobileOpen ? 'is-open' : ''}`} aria-label="Section controls">
          <button className="client-focus-actions" onClick={focusActions}>Focus on next actions</button>
          <nav aria-label="Jump to a client section">{sections.map(section => {
            const closed = minimised.includes(section.id)
            return <div key={section.id} className={`client-section-nav-row ${isView(section.id) && tab === section.id ? 'is-current' : ''}`}>
              <button className="client-section-jump" onClick={() => jump(section.id)} aria-label={`Go to ${section.label}`}><span>{section.label}</span><ArrowUpRight size={13} aria-hidden="true" /></button>
              <button className="client-section-toggle" aria-label={`${closed ? 'Expand' : 'Minimise'} ${section.label}`} aria-expanded={!closed} aria-controls={`client-section-${section.id}-body`} onClick={() => toggle(section.id)}>{closed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</button>
            </div>
          })}</nav>
          <div className="client-section-bulk"><button onClick={() => setMinimised([])}>Expand all</button><button onClick={() => setMinimised(sections.map(section => section.id))}>Minimise all</button></div>
          <p className="client-section-hint">Use the arrows to minimise sections. Draft values stay in place while you use this client page.</p>
        </fieldset>
      </aside>
      <div className="client-workspace-content">{children}</div>
    </div>
  </SectionContext.Provider>
}

export function ClientSection({ id, children }: { id: SectionId; children: ReactNode }) {
  const { minimised, toggle, ready } = useClientSections()
  const closed = minimised.includes(id), label = sections.find(section => section.id === id)!.label
  return <section id={`client-section-${id}`} className={`client-section ${closed ? 'is-minimised' : ''}`} aria-labelledby={`client-section-${id}-title`}>
    <div className="client-section-heading"><h2 id={`client-section-${id}-title`} tabIndex={-1}>{label}</h2><button disabled={!ready} onClick={() => toggle(id)} aria-expanded={!closed} aria-controls={`client-section-${id}-body`} aria-label={`${closed ? 'Expand' : 'Minimise'} ${label} content`}>{closed ? 'Expand' : 'Minimise'}{closed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</button></div>
    {closed && <p className="client-section-collapsed-note">Minimised · expand to view</p>}
    <div id={`client-section-${id}-body`} className="client-section-body" hidden={closed}>{children}</div>
  </section>
}
