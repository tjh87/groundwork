import type { Evidence } from '../calculation-evidence'

export const defaultModel = 'gpt-5.6-luna'
export type EvidenceBlock = { id: string; label: string; text: string; sources: string[] }
export type ModelReview = {
  provider: 'openai'; model: string; attempted: boolean; received: boolean;
  status: 'accepted' | 'not_configured' | 'not_needed' | 'source_check_failed' | 'timeout' | 'cancelled' | 'provider_error' | 'refused' | 'incomplete' | 'invalid_output' | 'insufficient_evidence';
  responseModel?: string; requestId?: string; responseId?: string; inputTokens?: number; outputTokens?: number;
  evidenceDigest?: string; availableIds?: string[]; selected?: EvidenceBlock[];
}

// The LLM can select evidence, never author a financial claim or edit its citation.
// Each block is bound to this one server-calculated reply, not the whole client book.
export function evidenceBlocks(evidence: Evidence): EvidenceBlock[] {
  const sources = [...evidence.sources]
  return [
    { id: 'result', label: evidence.title, text: `${evidence.result}. Calculation detail: ${evidence.exact}`, sources },
    ...evidence.inputs.slice(0, 24).map((i, n) => ({ id: `input_${n}`, label: i.label, text: `${i.value} (${i.kind})`, sources: [i.source] })),
    ...evidence.workings.slice(0, 12).map((w, n) => ({ id: `working_${n}`, label: w.label, text: w.formula, sources })),
    { id: 'reason', label: 'Why this matters', text: evidence.reason, sources },
    ...evidence.checks.filter(c => c.label !== 'Execution mode').slice(0, 12).map((c, n) => ({ id: `check_${n}`, label: `${c.status} · ${c.label}`, text: c.detail, sources })),
  ].filter(b => b.text && b.text.length <= 3000)
}

export function modelReviewLabel(review?: ModelReview): string {
  if (!review) return 'Rules engine. No LLM request was made.'
  switch (review.status) {
    case 'accepted': return `OpenAI · ${review.responseModel || review.model}. Live model call completed; selected evidence IDs passed validation.`
    case 'not_configured': return 'Rule-based response. No model evidence was added.'
    case 'not_needed': return 'Rules engine. This request needs no model call.'
    case 'source_check_failed': return 'Rules engine. A source check failed, so no model call was made.'
    case 'timeout': return 'Rules fallback. The OpenAI request timed out.'
    case 'cancelled': return 'Rules fallback. The OpenAI request was cancelled.'
    case 'provider_error': return 'Rules fallback. The OpenAI request failed.'
    case 'refused': return 'Rules fallback. OpenAI declined this request.'
    case 'incomplete': return 'Rules fallback. The model response was incomplete.'
    case 'insufficient_evidence': return 'Rules fallback. The model found insufficient relevant evidence.'
    case 'invalid_output': return 'Rules fallback. The model response failed validation.'
  }
}
