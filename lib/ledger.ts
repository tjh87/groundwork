export type DecisionType = "Accept" | "Modify" | "Ignore"
export type Decision = { id: string; insightId: string; client: string; insightTitle: string; decision: DecisionType; note: string; recordedAt: string }
const KEY = "advisory-grade-rm-ledger-v1"

export function getDecisions(strict = false): Decision[] {
  return readRecords(KEY, (value): value is Decision => {
    if (!value || typeof value !== 'object') return false
    const row = value as Decision
    return ['id', 'insightId', 'client', 'insightTitle', 'note'].every(k => typeof row[k as keyof Decision] === 'string') && ['Accept', 'Modify', 'Ignore'].includes(row.decision) && validDate(row.recordedAt)
  }, strict)
}

export function appendDecision(input: Omit<Decision, "id" | "recordedAt">) {
  const entry: Decision = { ...input, id: crypto.randomUUID(), recordedAt: new Date().toISOString() }
  window.localStorage.setItem(KEY, JSON.stringify([...getDecisions(true), entry]))
  window.dispatchEvent(new CustomEvent("advisory-ledger-change"))
  return entry
}

export function exportDecisions() {
  const payload = { exportedAt: new Date().toISOString(), system: "Groundwork", storage: "Browser-local review records; not an immutable audit log", decisions: getDecisions(true) }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `groundwork-ledger-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
import { readRecords, validDate } from './local-records'
