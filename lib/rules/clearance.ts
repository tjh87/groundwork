export function clearance(status: "GREEN" | "AMBER") {
  return status === "GREEN"
    ? [{ label: "Suitability", value: "Strategy discussion only" }, { label: "Product shelf", value: "Not applicable" }, { label: "Cross-border", value: "No product solicitation" }]
    : [{ label: "Suitability", value: "Needs updated cash-flow record" }, { label: "Product shelf", value: "Verify before implementation" }, { label: "Cross-border", value: "Hong Kong review required" }]
}
