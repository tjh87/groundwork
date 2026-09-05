import { narratives } from "@/lib/narrative"
import { additionalClients } from "@/lib/client-universe"
import { clearance } from "@/lib/rules/clearance"
import { cheungStressScenarios, raviStressScenarios } from "@/lib/rules/stress"
import { cheungSignals, evaluateBook, raviCollateralStress, raviSignals } from "@/lib/rules/triggers"
import type { ClientProfile, EventOpportunity, RMAction, WhyInsight } from "@/lib/types"

const ravi = raviSignals()
const cheung = cheungSignals()

export const asOf = "26 Aug 2026"
export const morningAlerts = evaluateBook()

export const insights: Record<string, WhyInsight> = {
  "ravi-collateral-why": {
    id: "ravi-collateral-why", client: "Ravi Chandrasekaran", title: "Client accepted higher leverage after collateral volatility", sourceLabel: "Rule-based",
    trigger: "Ravi drew another USD 1.7m after the technology decline and after the RM warned about collateral volatility. Current LTV is 73.71%.", threshold: "The facility trigger is 75.00%. Only about USD 114k of risk-based draw capacity remains.",
    chain: ["Listed technology fell and eligible collateral value declined.", "Ravi was agitated but retained his technology conviction.", "The RM warned that another draw would increase utilisation while collateral was most volatile; Ravi acknowledged the warning and proceeded.", "USD 2.50m remains contractually undrawn, but it is not usable risk capacity.", "A further 5% decline in technology collateral raises LTV to about 75.83%."],
    alternatives: [{ label: "Increase the Lombard limit", outcome: "Rejected", reason: "A larger limit does not reduce LTV or improve collateral coverage." }, { label: "Draw the remaining USD 2.50m", outcome: "Rejected", reason: "The draw would breach the collateral ratio before contractual availability is exhausted." }, { label: "Sell listed technology immediately", outcome: "Rejected", reason: "This conflicts with the client’s stated preference before the secondary sale." }, { label: "Add diversified eligible collateral or hedge", outcome: "Considered", reason: "This can protect the bridge without forcing an immediate technology sale, subject to suitability and approval." }],
confidence: "High", changesIt: "A completed and settled secondary sale, lower borrowing, eligible collateral added, or an approved hedge.", timestamp: "Portfolio 26 Aug 2026 · RM note 11 Jun 2026", provenance: "Holdings, credit facilities, mandate, RM notes", recommendation: "Agree a pre-committed intervention plan. Do not support another draw until eligible collateral, an approved hedge, or a verified sale-backed structure is in place.",
  },
  "ravi-intervention-why": {
    id: "ravi-intervention-why", client: "Ravi Chandrasekaran", title: "Pre-agreed controls preserve Ravi’s technology conviction", sourceLabel: "Rule-based",
    trigger: "The client knowingly increased leverage after the RM raised the collateral risk.", threshold: "Move from monitoring to intervention at the proposed 74.00% RM control level, before the 75.00% facility trigger.",
    chain: ["The warning alone did not change the client’s decision.", "The RM therefore needs actions agreed before the next volatile session.", "A 74.00% control level creates a small execution window before the facility trigger.", "Collateral, hedging, or repayment actions can preserve the technology position while reducing forced-sale risk."],
    alternatives: [{ label: "Continue monitoring only", outcome: "Rejected", reason: "Monitoring did not prevent the latest post-warning draw." }, { label: "Treat the Q4 sale as available cash", outcome: "Rejected", reason: "Banker indication is not a signed or settled transaction." }, { label: "Agree an intervention ladder now", outcome: "Considered", reason: "It turns the RM’s warning into specific client-authorised actions." }],
    confidence: "High", changesIt: "A signed and settled sale, lower debt, added eligible collateral, or a changed client preference.", timestamp: "Portfolio 26 Aug 2026 · RM note 11 Jun 2026", provenance: "Holdings, credit facilities, sale status, RM notes", recommendation: "Obtain agreement on a 74.00% RM control level and document the first cure action, owner, and execution authority.",
  },
  "cheung-duration-why": {
    id: "cheung-duration-why", client: "Cheung Kwok Wing", title: "Income need rose while spendable reserves stayed flat", sourceLabel: "Rule-based",
    trigger: "Annual withdrawals increased to USD 1.28m.", threshold: "This fixed case tests a three-year reserve of USD 3.84m. It is a demo assumption to discuss, not an agreed client target. RecSys starts with an editable two-year reserve.",
    chain: ["Medical costs raised the quarterly withdrawal to USD 320k.", "Cash across all currencies is about USD 1.95m equivalent, but only USD 0.80m is in USD. The cash-only gap to this three-year USD reserve is USD 3.04m; verify conversions, coupons and near-term maturities before counting them.", "The 2045 Treasury is 20.8% of AUM and has fallen 14.9% since December.", "Selling long duration under pressure would crystallize the client’s main concern."],
    alternatives: [{ label: "Sell the 2045 Treasury immediately", outcome: "Rejected", reason: "Ignores the client’s aversion to realizing the loss." }, { label: "Add shipping exposure", outcome: "Rejected", reason: "Increases familiarity bias and single-sector risk." }, { label: "Fund a staged reserve from coupons, maturities, and gains", outcome: "Considered", reason: "Reduces forced-sale risk without one large transaction." }],
    confidence: "High", changesIt: "Lower medical spending, an updated reserve preference, or sufficient near-term maturities.", timestamp: "Portfolio 26 Aug 2026 · RM note 16 Jul 2026", provenance: "Holdings, mandate, cash needs, RM notes", recommendation: "Build the reserve in stages and shorten duration only after suitability and product checks.",
  },
  "hartono-fx-why": {
    id: "hartono-fx-why", client: "Hartono Wijaya Kusuma", title: "The property payment is exposed to portfolio currency timing", sourceLabel: "Rule-based",
    trigger: "97.1% of assets are outside SGD while SGD 9.0m is confirmed for a property deposit.", threshold: "Escalate when a confirmed 12-month cash need is not matched by currency and liquidity.", chain: ["Base currency is SGD.", "Most holdings are in USD or regional currencies.", "The deposit is fixed in SGD.", "FX moves can change the amount that must be sold."], alternatives: [{ label: "Wait until payment date", outcome: "Rejected", reason: "Leaves the full conversion rate uncertain." }], confidence: "High", changesIt: "A funded SGD reserve, documented FX hedge, or payment-date change.", timestamp: "Portfolio 26 Aug 2026", provenance: "Holdings, cash needs, RM notes", recommendation: "Stage the SGD funding plan and review energy-linked collateral at the same meeting.",
  },
  "voss-mandate-why": {
    id: "voss-mandate-why", client: "Margarethe Voss-Brenner", title: "The portfolio is outside the conservative mandate", sourceLabel: "Rule-based",
    trigger: "Equity is 71.5%; fixed income is 9.2%.", threshold: "Mandate ranges: equity ≤30%; fixed income ≥45%.", chain: ["Equity exceeds its ceiling by 41.5pp.", "Fixed income is 35.8pp below its floor.", "A EUR 3.4m tax payment is due before year-end.", "Liquidity and mandate remediation must be coordinated."], alternatives: [{ label: "Treat cash need separately", outcome: "Rejected", reason: "Could worsen the mandate breach." }], confidence: "High", changesIt: "A signed mandate change or completed rebalance.", timestamp: "Portfolio 26 Aug 2026", provenance: "Holdings, mandate, cash needs", recommendation: "Escalate the mandate breach and build the tax reserve as one controlled rebalance.",
  },
  "event-tech-why": {
    id: "event-tech-why", client: "Ravi Chandrasekaran", title: "Technology volatility exposed the borrowing feedback loop", sourceLabel: "AI-generated",
    trigger: "5 Jun: megacap technology shed about USD 2tn on AI capex concerns.", threshold: "Portfolio link requires disclosed technology exposure plus secured borrowing.", chain: ["Technology values fall.", "Eligible collateral value falls.", "LTV rises toward its trigger.", "The client has less flexibility before the planned sale."], alternatives: [{ label: "Use the drawdown to add exposure", outcome: "Rejected", reason: "The facility is already 73.71% LTV." }], confidence: "High", changesIt: "Reduced debt, completed sale, or a materially different collateral mix.", timestamp: "Event 5 Jun 2026 · portfolio 26 Aug 2026", provenance: "Supplied event log + deterministic exposure match; narrative is canned", recommendation: "Use the event as the reason to agree a no-new-draw guardrail and sale-delay plan.",
  },
  "event-rates-why": {
    id: "event-rates-why", client: "Cheung Kwok Wing", title: "Higher long yields explain the mark-to-market loss", sourceLabel: "AI-generated",
    trigger: "29 Jul: the Fed held rates; the US 10-year yield reached 4.71%.", threshold: "Portfolio link requires long-duration fixed income or rate-sensitive assets.", chain: ["Long yields rise.", "Long-duration bond prices fall.", "The 2045 Treasury loses value despite continued coupon income.", "Higher withdrawals increase the cost of waiting for recovery."], alternatives: [{ label: "Promise a bond-price recovery", outcome: "Rejected", reason: "The event log does not support a forecast." }], confidence: "High", changesIt: "A shorter duration profile, lower withdrawals, or a sustained change in yields.", timestamp: "Event 29 Jul 2026 · portfolio 26 Aug 2026", provenance: "Supplied event log + deterministic duration match; narrative is canned", recommendation: "Explain duration plainly, then fund spending without forcing an all-at-once loss realization.",
  },
  "event-shipping-why": {
    id: "event-shipping-why", client: "Cheung Kwok Wing", title: "Shipping gains create a funding window, not a new sector bet", sourceLabel: "AI-generated",
    trigger: "5 Aug: the naval blockade was reimposed, affecting shipping and insurance.", threshold: "Portfolio link requires a directly affected shipping holding.", chain: ["Shipping risk premia rise.", "Pacific Orient gained about USD 360k since December.", "The gain partly offsets bond losses.", "A staged trim could help fund the spending reserve."], alternatives: [{ label: "Increase shipping exposure", outcome: "Rejected", reason: "The client’s source of wealth already creates familiarity bias." }], confidence: "Medium", changesIt: "A reversal in the holding, changed spending needs, or tax constraints.", timestamp: "Event 5 Aug 2026 · portfolio 26 Aug 2026", provenance: "Supplied event log + holding match; narrative is canned", recommendation: "Review a partial trim as one source of reserve funding, subject to suitability and tax review.",
  },
}

export const events: EventOpportunity[] = [
  { id: "tech", date: "05 JUN", event: "AI capex concerns hit megacap technology", transmission: "Technology values → collateral value → LTV", affected: "Ravi", idea: "Agree borrowing guardrails before the planned sale", insightId: "event-tech-why" },
  { id: "rates", date: "29 JUL", event: "Fed holds; US 10-year reaches 4.71%", transmission: "Long yields → duration loss → spending pressure", affected: "Cheung", idea: "Explain the loss and stage a reserve", insightId: "event-rates-why" },
  { id: "shipping", date: "05 AUG", event: "Naval blockade affects shipping and insurance", transmission: "Shipping risk → holding gain → reserve funding window", affected: "Cheung", idea: "Review a partial trim, not a larger sector bet", insightId: "event-shipping-why" },
]

export const todayActions: RMAction[] = [
  { id: "act-ravi", client: "Ravi Chandrasekaran", slug: "ravi-chandrasekaran", urgency: "Critical", due: "Before next draw", title: "Agree the 74% intervention level", message: "Call Ravi before any further draw. Agree the collateral cure, 74% RM control, and sale-delay plan." },
  { id: "act-voss", client: "Margarethe Voss-Brenner", slug: "margarethe-voss-brenner", urgency: "Critical", due: "Today", title: "Fund the inheritance-tax reserve", message: "Book a clear, staged review. Ring-fence EUR 3.4m and start restoring the conservative mandate." },
  { id: "act-hartono", client: "Hartono Wijaya Kusuma", slug: "hartono-wijaya-kusuma", urgency: "High", due: "Today", title: "Start the SGD property funding plan", message: "Confirm property dates and stage the SGD reserve before discussing more energy exposure." },
  { id: "act-cheung", client: "Cheung Kwok Wing", slug: "cheung-kwok-wing", urgency: "High", due: "Today", title: "Update the medical spending runway", message: "Confirm the new medical-cost range and review a staged reserve without forcing a full bond sale." },
]

export const clients: Record<string, ClientProfile> = {
  "ravi-chandrasekaran": {
    slug: "ravi-chandrasekaran", id: "CL-0002", name: "Ravi Chandrasekaran", context: "Founder · enterprise software",
    sourceOfWealth: "Entrepreneur and founder of an enterprise software company; most wealth remains in the unlisted founder holding.",
    objectives: "Bridge liquidity until an expected Q4 2026 secondary share sale, then diversify and establish a family trust.",
    aum: "USD 46.7m", riskProfile: "Growth", baseCurrency: "USD", reportingLanguage: "English", taxDomicile: "Singapore", priority: "Action", primaryRisk: "Collateral", nextReview: "Today",
    allocationTitle: "Total wealth structure",
    allocation: [{ label: "Founder holding", value: 68.35 }, { label: "Public equity", value: 23.53 }, { label: "Structured note", value: 3.37 }, { label: "Fixed income", value: 2.61 }, { label: "Cash", value: 2.14 }],
    signals: [{ label: "Post-volatility draw", value: "USD 1.7m", note: "RM warning acknowledged; client proceeded", tone: "critical" }, { label: "Risk-based draw capacity", value: `USD ${(ravi.riskBasedDrawCapacity / 1_000_000).toFixed(2)}m`, note: `Versus USD ${(ravi.contractualUndrawn / 1_000_000).toFixed(2)}m contractual availability`, tone: "critical" }, { label: "Technology exposure", value: `${ravi.advisoryTechPct.toFixed(1)}% advisory`, note: `${ravi.founderConcentrationPct.toFixed(1)}% of total wealth is founder stock`, tone: "warn" }],
    likelyAsk: narratives.raviLikelyAsk,
    clientStance: "Keep all listed technology positions until the expected Q4 2026 secondary sale; comfortable increasing the Lombard line if required.",
    rmOpening: "Your technology conviction can remain intact. First, let us agree the borrowing envelope and actions that prevent an unplanned sale before the secondary closes.",
    action: { title: "Protect the technology position with a borrowing envelope", status: "GREEN", body: `Separate the USD ${(ravi.contractualUndrawn / 1_000_000).toFixed(2)}m contractual availability from the USD ${(ravi.riskBasedDrawCapacity / 1_000_000).toFixed(2)}m risk-based capacity. Propose no further draw until eligible collateral, an approved hedge, or a verified sale-backed structure is in place. Pre-agree the cure actions before volatility returns.`, steps: ["Agree a 74.00% RM intervention level", "Model three-, six-, and twelve-month sale delays", "Prepare the post-sale debt, tax, trust, and diversification waterfall without selling now"], checks: clearance("GREEN") },
    avoid: { title: "Do not present a larger facility limit as the solution", reason: "A higher contractual limit does not improve collateral coverage. Further borrowing increases LTV and forced-sale risk." },
    intervention: {
      label: "Accepted risk intervention",
      observedAction: "Client acknowledged the warning and drew another USD 1.7m to fund a pre-IPO secondary while collateral was volatile.",
      metrics: [{ label: "Contractual availability", value: `USD ${(ravi.contractualUndrawn / 1_000_000).toFixed(2)}m`, note: "Facility limit minus current draw", tone: "neutral" }, { label: "Risk-based draw capacity", value: `USD ${(ravi.riskBasedDrawCapacity / 1_000_000).toFixed(2)}m`, note: "Before the 75% LTV trigger", tone: "critical" }, { label: "Current LTV", value: "73.71% / 75%", note: "Only 1.29 percentage points to trigger", tone: "warn" }],
      saleStages: [{ label: "Banker indication", state: "current" }, { label: "Term sheet", state: "pending" }, { label: "Signed sale", state: "pending" }, { label: "Cash settled", state: "pending" }],
      controls: [{ level: "Now · 73.71%", action: "Daily monitoring; no new draw until the collateral plan is agreed." }, { level: "RM control · 74.00%", action: "Add eligible collateral, implement an approved hedge, or repay debt." }, { level: "Facility trigger · 75.00%", action: "Execute the documented cure action under facility terms." }],
      collateralStress: raviCollateralStress(),
    },
    scenarios: raviStressScenarios(), insightIds: ["ravi-collateral-why", "ravi-intervention-why", "event-tech-why"],
  },
  "cheung-kwok-wing": {
    slug: "cheung-kwok-wing", id: "CL-0012", name: "Cheung Kwok Wing", context: "Retired shipping executive",
    sourceOfWealth: "Retired shipping-group executive; wealth accumulated through compensation and long-term investment savings.",
    objectives: "Draw USD 1.1m a year for living and medical costs while preserving capital for two children; current withdrawals have risen to USD 1.28m.",
    aum: "USD 28.0m", riskProfile: "Income", baseCurrency: "USD", reportingLanguage: "Traditional Chinese", taxDomicile: "Hong Kong SAR", priority: "Action", primaryRisk: "Liquidity", nextReview: "Today",
    allocationTitle: "Current asset mix",
    allocation: [{ label: "Fixed income", value: 66.62 }, { label: "Equity", value: 22.12 }, { label: "Cash", value: 6.97 }, { label: "Alternatives", value: 4.29 }],
    signals: [{ label: "Three-year reserve", value: `USD ${(cheung.reserveGap / 1_000_000).toFixed(2)}m gap`, note: "At current annual withdrawal", tone: "critical" }, { label: "2045 Treasury", value: `${cheung.longBondPct.toFixed(1)}% of AUM`, note: "Price is down 14.9% since December", tone: "warn" }, { label: "Mandate", value: "Within bands", note: "Liquidity need changed; mandate did not", tone: "neutral" }],
    likelyAsk: narratives.cheungLikelyAsk,
    action: { title: "Create a spending runway without one forced sale", status: "AMBER", body: "Build a two-to-three-year reserve in stages from coupons, maturities, and a review of appreciated shipping exposure; shorten duration gradually after updated suitability checks.", steps: ["Confirm a revised medical-cost range", "Map coupons and maturities for 36 months", "Review partial shipping trim and duration changes"], checks: clearance("AMBER") },
    avoid: { title: "Do not say bonds are safe or promise recovery", reason: "That would blur income certainty with price stability. Explain duration and the funding plan instead." },
    scenarios: cheungStressScenarios(), insightIds: ["cheung-duration-why", "event-rates-why", "event-shipping-why"],
  },
  ...additionalClients,
}

export const clientDirectory = Object.values(clients).sort((a, b) => a.id.localeCompare(b.id))
