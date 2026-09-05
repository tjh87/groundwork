export const draftNumber = (value: string) => value.trim() === '' ? NaN : Number(value)

export function draftIssue(label: string, value: string, min: number, max: number, optional = false) {
  if (optional && value.trim() === '') return ''
  const number = draftNumber(value)
  return Number.isFinite(number) && number >= min && number <= max ? '' : `${label}: enter a number from ${min} to ${max}.`
}
