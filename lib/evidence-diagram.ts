import type { Evidence } from './calculation-evidence'
import type { ModelReview } from './priscilla/model-contract'

// Only controlled syntax and escaped labels. No user-supplied Mermaid or click directives.
const label = (value: string) => value.replace(/[^a-zA-Z0-9 $.,%()/+−–-]/g, ' ').slice(0, 100)
export function evidenceDiagram(evidence: Evidence, model?: ModelReview) {
  const calculation = evidence.diagram === 'interest' ? 'Principal x rate x time' : evidence.diagram === 'funding' ? 'Spending + interest - eligible cash' : evidence.diagram === 'agent' ? 'Evaluate rules and rank actions' : evidence.diagram === 'recommendation' ? 'Score goals and check portfolio gates' : 'Apply holding shocks and aggregate'
  const hasFailure = evidence.checks.some(c => c.status === 'fail')
  return `flowchart TD
  source["Source snapshot ${label(evidence.sourceDate)}"]
  assumptions["${evidence.diagram === 'agent' ? 'Priority rules and recorded RM feedback' : 'Scenario assumptions and RM inputs'}"]
  calculation["${calculation}"]
  checks{"${hasFailure ? 'Review required' : 'Calculation checks recorded'}"}
  result["${label(evidence.result)}"]
  review["Confirm sources and missing facts"]
  rm["RM reviews before advice"]
  source --> calculation
  assumptions --> calculation
  calculation --> checks
  checks --> result
  checks --> review
  result --> rm
  review --> rm${model?.attempted ? `
  model["OpenAI evidence selection"]
  result --> model
  ${model.received ? `validation{"Validate response and evidence IDs"}
  model --> validation
  validation -->|${model.status === 'accepted' ? 'Accepted in this call' : 'Not accepted in this call'}| outcome` : 'model -->|Request failed| outcome'}
  outcome["${model.status === 'accepted' ? 'Render unchanged cited facts' : 'Keep source-backed base reply'}"]
  outcome --> rm` : ''}`
}
