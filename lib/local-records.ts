// Invalid or inaccessible storage must never crash a screen or be overwritten as an empty ledger.
export function readRecords<T>(key: string, valid: (value: unknown) => value is T, strict = false): T[] {
  if (typeof window === 'undefined') return []
  try {
    const stored = window.localStorage.getItem(key)
    if (stored === null) return []
    const records: unknown = JSON.parse(stored)
    if (!Array.isArray(records) || !records.every(valid)) throw new Error('Saved records are not readable. Existing data was kept unchanged.')
    return records
  } catch (error) {
    if (strict) throw error
    return []
  }
}
export const validDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
