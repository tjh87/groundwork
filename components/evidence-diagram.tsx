"use client"

import { useEffect, useId, useState } from 'react'

export function EvidenceDiagram({ code }: { code: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, ''), [svg, setSvg] = useState(''), [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    setSvg(''); setError(false)
    void (async () => {
      try {
        const [{ default: mermaid }, { default: DOMPurify }] = await Promise.all([import('mermaid'), import('dompurify')])
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme: 'base', fontFamily: 'Avenir Next, Arial, sans-serif', flowchart: { curve: 'basis', useMaxWidth: true }, themeVariables: { primaryColor: '#efeee5', primaryTextColor: '#141e55', primaryBorderColor: '#001489', lineColor: '#717899', fontSize: '15px' } })
        const { svg: output } = await mermaid.render(`groundwork-evidence-${id}`, code)
        if (alive) setSvg(DOMPurify.sanitize(output, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['foreignObject', 'a'], FORBID_ATTR: ['onload', 'onclick'] }))
      } catch { if (alive) setError(true) }
    })()
    return () => { alive = false }
  }, [code, id])
  return <div className="fact-diagram">{svg ? <div role="img" aria-label="Evidence path from source data and assumptions through calculation checks to RM review" dangerouslySetInnerHTML={{ __html: svg }} /> : <p role="status">{error ? 'The diagram could not load. The complete workings and sources remain available.' : 'Drawing the evidence map…'}</p>}<p>Visual summary of documented inputs and rules. It is not a transcript of private model reasoning.</p></div>
}
