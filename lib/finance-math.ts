// Rates use percentage points: 6.15 means 6.15%, and 100bp adds 1 point.
export function facilityInterest(facility: { drawn: number; rate: number }, months = 12, shockBps = 0) {
  const rate = facility.rate + shockBps / 100
  return { rate, decimalRate: rate / 100, amount: facility.drawn * rate / 100 * months / 12, months, shockBps }
}
