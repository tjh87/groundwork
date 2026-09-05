import type { Evidence } from '../calculation-evidence'
import { snapshot } from '../wealth-model'
import type { PriscillaRecommendation } from './engine'

export function replyEvidence(reply: { evidence?: Evidence; action_ids?: string[]; client_links?: { client_id: string }[] }, recommendations: PriscillaRecommendation[]): Evidence {
  if (reply.evidence) return reply.evidence
  const ids = reply.action_ids || []
  if (new Set(ids).size !== ids.length || ids.some(id => !recommendations.some(r => r.id === id))) throw new Error('Invalid action reference')
  const actions = ids.map(id => recommendations.find(r => r.id === id)!)
  return { title: actions.length ? 'Why these clients need attention' : 'How Priscilla prepared this reply', sourceDate: snapshot.asOf, diagram: 'agent',
    summary: actions.length ? 'Source-driven review flags are ranked using explicit priority rules and your saved feedback.' : 'Priscilla selects a supported response using the message and client context. It uses a deterministic rules engine.',
    result: actions.length ? `${actions.length} ranked review actions` : 'Rules-based reply', exact: 'No model probability or confidence score is calculated.',
    inputs: actions.map(a => ({ label: `${a.client_name} · ${a.title}`, value: `${a.score} priority points`, source: a.grounding.join('; '), kind: 'Calculated' })),
    workings: actions.length ? actions.map(a => ({ label: a.client_name, formula: `Base ${a.base_score} + recorded-feedback boost ${a.feedback_boost} = ${a.score} priority points. ${a.rationale}` })) : [{ label: 'Route the request', formula: 'Match a named client or the current file, choose a supported briefing, navigation or scenario operation; ask for missing context.' }, { label: 'Data boundary', formula: 'Use only the supplied snapshot and saved RM feedback. Current workbench drafts and simulated external accounts are not sent to chat.' }],
    checks: [{ label: 'Execution mode', status: 'pass', detail: 'The base reply and figures use the app’s rules and source-backed templates. Any model evidence selection is recorded separately under Trace & logs.' }, { label: 'Source freshness', status: 'review', detail: `Data is a synthetic ${snapshot.asOf} snapshot. No current market verification was performed.` }, ...actions.map(a => ({ label: a.client_name + ' · priority arithmetic', status: (a.score === a.base_score + a.feedback_boost ? 'pass' : 'fail') as 'pass' | 'fail', detail: 'Priority points order RM reviews; they are not portfolio goal-fit or suitability probabilities.' }))],
    reason: actions.length ? actions.map(a => `${a.client_name}: ${a.rationale}`).join('\n\n') : 'Use the reply to locate evidence and prepare a review. Confirm missing client preferences and source records before advice.',
    sources: actions.length ? [...new Set(actions.flatMap(a => a.grounding))] : ['priscilla/engine.ts: chatReply', ...((reply.client_links || []).map(c => `clients.csv: ${c.client_id}`))],
    limits: ['Dismissed items are hidden from this queue; the underlying risks remain.', 'Accepted action kinds receive one 15-point boost. No learned financial outcome or model-accuracy claim is made.', 'No raw prompt, client note or authentication header is retained in the telemetry logs.'],
  }
}
