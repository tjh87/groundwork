import type { MorningAlert } from "@/lib/types"

export const raviRaw = {
  totalAum: 46_699_200,
  privateCompany: 31_920_000,
  advisoryAum: 14_779_200,
  informationTechnology: 9_436_000,
  heliosLinked: 3_641_000,
  drawn: 6_500_000,
  limit: 9_000_000,
  collateralValue: 8_818_810,
  collateralTechValue: 4_936_990,
  currentLtv: 73.71,
  triggerLtv: 75,
}

export const cheungRaw = {
  totalAum: 28_028_700,
  ust2045: 5_820_000,
  cash: 1_952_000,
  annualDraw: 1_280_000,
  statedAnnualDraw: 1_100_000,
}

export function percent(part: number, whole: number) { return (part / whole) * 100 }

export function raviSignals() {
  const riskBasedDrawCapacity = raviRaw.collateralValue * (raviRaw.triggerLtv / 100) - raviRaw.drawn
  return {
    founderConcentrationPct: percent(raviRaw.privateCompany, raviRaw.totalAum),
    advisoryTechPct: percent(raviRaw.informationTechnology, raviRaw.advisoryAum),
    heliosPct: percent(raviRaw.heliosLinked, raviRaw.advisoryAum),
    ltvHeadroomPct: ((raviRaw.triggerLtv - raviRaw.currentLtv) / raviRaw.triggerLtv) * 100,
    riskBasedDrawCapacity,
    contractualUndrawn: raviRaw.limit - raviRaw.drawn,
  }
}

export function raviCollateralStress() {
  return [0, 0.05, 0.1, 0.2].map((shock) => {
    const lendingValue = raviRaw.collateralValue - raviRaw.collateralTechValue * shock
    const ltv = (raviRaw.drawn / lendingValue) * 100
    const permittedDebt = lendingValue * (raviRaw.triggerLtv / 100)
    const repayment = Math.max(0, raviRaw.drawn - permittedDebt)
    const collateralGap = Math.max(0, raviRaw.drawn / (raviRaw.triggerLtv / 100) - lendingValue)
    return {
      shock: shock === 0 ? "Current" : `Technology −${(shock * 100).toFixed(0)}%`,
      ltv: `${ltv.toFixed(2)}%`,
      repayment: repayment === 0 ? "None" : `USD ${(repayment / 1_000).toFixed(0)}k`,
      collateralGap: collateralGap === 0 ? "None" : `USD ${(collateralGap / 1_000).toFixed(0)}k`,
    }
  })
}

export function cheungSignals() {
  const reserveTarget = cheungRaw.annualDraw * 3
  return {
    longBondPct: percent(cheungRaw.ust2045, cheungRaw.totalAum),
    annualDrawIncreasePct: percent(cheungRaw.annualDraw - cheungRaw.statedAnnualDraw, cheungRaw.statedAnnualDraw),
    reserveTarget,
    reserveGap: reserveTarget - cheungRaw.cash,
  }
}

export function evaluateBook(): MorningAlert[] {
  const ravi = raviSignals()
  const cheung = cheungSignals()
  return [
    { id: "ravi-collateral", client: "Ravi Chandrasekaran", slug: "ravi-chandrasekaran", context: "Founder · enterprise software", aum: "USD 46.7m", severity: "Critical", headline: `USD 1.7m added after volatility; only USD ${(ravi.riskBasedDrawCapacity / 1_000_000).toFixed(2)}m risk capacity remains`, detail: `The client acknowledged the collateral warning and proceeded. Current LTV is ${raviRaw.currentLtv.toFixed(2)}% against a ${raviRaw.triggerLtv.toFixed(0)}% trigger; contractual availability is not usable risk capacity.`, risks: ["Collateral", "Concentration", "Liquidity"], insightId: "ravi-collateral-why" },
    { id: "cheung-liquidity", client: "Cheung Kwok Wing", slug: "cheung-kwok-wing", context: "Retired shipping executive", aum: "USD 28.0m", severity: "High", headline: `Three-year spending reserve is short USD ${(cheung.reserveGap / 1_000_000).toFixed(2)}m`, detail: `Annual withdrawals rose ${cheung.annualDrawIncreasePct.toFixed(1)}%; the 2045 Treasury is ${cheung.longBondPct.toFixed(1)}% of AUM and remains exposed to duration.`, risks: ["Liquidity", "Duration", "Concentration"], insightId: "cheung-duration-why" },
    { id: "hartono-fx", client: "Hartono Wijaya Kusuma", slug: "hartono-wijaya-kusuma", context: "Family coal group · Singapore", aum: "USD 46.6m eq.", severity: "High", headline: "97.1% of the portfolio is outside base currency", detail: "A likely SGD 9.0m property deposit and a 41.4% energy concentration make FX timing material.", risks: ["Currency", "Concentration", "Liquidity"], insightId: "hartono-fx-why" },
    { id: "voss-mandate", client: "Margarethe Voss-Brenner", slug: "margarethe-voss-brenner", context: "Conservative mandate · Europe", aum: "USD 22.2m eq.", severity: "Critical", headline: "Equities are 71.5% versus a 30% mandate ceiling", detail: "Fixed income is 9.1% versus a 45% floor, with EUR 3.4m of confirmed tax due before year-end.", risks: ["Mandate", "Liquidity", "Concentration"], insightId: "voss-mandate-why" },
  ]
}
