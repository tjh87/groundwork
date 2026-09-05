export type RiskKind = "Concentration" | "Liquidity" | "Currency" | "Mandate" | "Collateral" | "Duration"

export type WhyInsight = {
  id: string
  client: string
  title: string
  sourceLabel: "Rule-based" | "AI-generated"
  trigger: string
  threshold: string
  chain: string[]
  alternatives: { label: string; outcome: "Rejected" | "Considered"; reason: string }[]
  confidence: "High" | "Medium"
  changesIt: string
  timestamp: string
  provenance: string
  recommendation: string
}

export type MorningAlert = {
  id: string
  client: string
  slug?: string
  context: string
  aum: string
  severity: "Critical" | "High"
  headline: string
  detail: string
  risks: RiskKind[]
  insightId: string
}

export type EventOpportunity = {
  id: string
  date: string
  event: string
  transmission: string
  affected: string
  idea: string
  insightId: string
}

export type RMAction = {
  id: string
  client: string
  slug: string
  urgency: "Critical" | "High"
  due: string
  title: string
  message: string
}

export type StressScenario = {
  id: string
  label: string
  impactLabel: string
  portfolioImpactPct: number
  result: string
  detail: string
  components: string[]
  drivers: { label: string; value: number }[]
  comparison: { current: string; stressed: string; afterAction: string; afterActionNote: string }
  decision: {
    title: string
    summary: string
    rebalance: { action: string; amount: string; rationale: string }[]
    reasoning: string[]
    taxOpportunity: { title: string; detail: string; guardrail: string }
  }
}

export type InterventionModel = {
  label: string
  observedAction: string
  metrics: { label: string; value: string; note: string; tone: "critical" | "warn" | "neutral" }[]
  saleStages: { label: string; state: "current" | "pending" }[]
  controls: { level: string; action: string }[]
  collateralStress: { shock: string; ltv: string; repayment: string; collateralGap: string }[]
}

export type ClientProfile = {
  slug: string
  id: string
  name: string
  context: string
  sourceOfWealth: string
  objectives: string
  aum: string
  riskProfile: string
  baseCurrency: string
  reportingLanguage: string
  taxDomicile: string
  priority: "Action" | "Watch"
  primaryRisk: RiskKind
  nextReview: string
  allocationTitle: string
  allocation: { label: string; value: number }[]
  signals: { label: string; value: string; note: string; tone: "critical" | "warn" | "neutral" }[]
  likelyAsk: string
  clientStance?: string
  rmOpening?: string
  action: { title: string; status: "GREEN" | "AMBER"; body: string; steps: string[]; checks: { label: string; value: string }[] }
  avoid: { title: string; reason: string }
  scenarios: StressScenario[]
  intervention?: InterventionModel
  insightIds: string[]
}
