import type { RMAction } from "@/lib/types"
import { readRecords, validDate } from './local-records'

export type RMActionState = { actionId: string; sentAt?: string; completedAt?: string; delivery?: "browser" | "in-app" }
const KEY = "advisory-grade-rm-actions-v1"

export function getRMActionStates(strict = false): RMActionState[] {
  return readRecords(KEY, (value): value is RMActionState => {
    if (!value || typeof value !== 'object') return false
    const row = value as RMActionState
    return typeof row.actionId === 'string' && (row.sentAt === undefined || validDate(row.sentAt)) && (row.completedAt === undefined || validDate(row.completedAt)) && (row.delivery === undefined || row.delivery === 'browser' || row.delivery === 'in-app')
  }, strict)
}

function save(next: RMActionState[]) {
  window.localStorage.setItem(KEY, JSON.stringify(next))
  window.dispatchEvent(new CustomEvent("advisory-rm-actions-change"))
}

function updateAction(actionId: string, patch: Partial<RMActionState>) {
  const current = getRMActionStates(true)
  const existing = current.find((item) => item.actionId === actionId)
  save(existing ? current.map((item) => item.actionId === actionId ? { ...item, ...patch } : item) : [...current, { actionId, ...patch }])
}

export function markRMAction(actionId: string, completed: boolean) {
  updateAction(actionId, { completedAt: completed ? new Date().toISOString() : undefined })
}

export async function pushRMAction(action: RMAction): Promise<{ delivery: "browser" | "in-app"; recorded: boolean }> {
  // Keep a visible local fallback before requesting browser notification permission.
  updateAction(action.id, { sentAt: new Date().toISOString(), delivery: 'in-app' })
  let delivery: "browser" | "in-app" = "in-app"
  try {
    if (typeof Notification !== "undefined") {
      const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission
      if (permission === "granted") {
        // Avoid showing client identities and financial details on a lock screen.
        new Notification('Groundwork · RM review', { body: 'Open the app to review the flagged action and client brief.', tag: action.id })
        delivery = "browser"
      }
    }
  } catch { /* Some mobile browsers expose Notification but reject construction. */ }
  try { updateAction(action.id, { delivery }) } catch { return { delivery, recorded: false } }
  return { delivery, recorded: true }
}
