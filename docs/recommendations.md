# Goal-matched portfolio recommendations

The Recommendations tab is the first view in each client brief. It builds a shortlist for an RM to review before giving advice. It can abstain when no tested option passes. No suitability approval, trade, client communication or financial return is promised.

## Research basis

This is a knowledge- and constraint-based recommender. Client requirements are matched to defined candidate attributes. Hard constraints are tested first; remaining options are ranked by explicit goal fit. The design is informed by [Lubos et al., Analysis Operations for Constraint-based Recommender Systems, ACM RecSys 2023](https://tugraz.elsevierpure.com/ws/portalfiles/portal/72637700/3604915.3608819.pdf).

[ACM RecSys](https://recsys.acm.org/) is a research community and conference, not a portfolio API or endorsement. The financial assumptions, model mixes, horizons, scoring functions and control thresholds here are our transparent hackathon design choices. They have not been calibrated against real client outcomes. No recommendation model is trained on the 20 synthetic clients, and no peer purchases or bank revenue enter the score.

## Inputs and source boundaries

- Uses all accounts and holdings in the existing whole-wealth simulation, including labelled external examples.
- Uses source objectives, source of wealth, account mandates, dated needs, cost basis and actual RM notes.
- Draft goal priorities are inferred from objectives and notes; the RM can change them. This does not edit the source profile or establish client consent.
- Annual income need, requested gross cash yield, income assumptions, draft loss limit and values constraints are linked to Goals & values.
- A requested total return is visible but not scored: no calibrated return forecast is available.
- Reserve goal defaults to two years of entered annual need plus likely/confirmed one-off needs starting within 18 months. Conditional sale taxes, irregular commitments and unallocated instalments are not silently included. This is an editable planning default, not a dated funding forecast.
- The reserve currency comes from the largest non-conditional/non-aspirational source need, or the client base if none exists. Reserve amounts are entered in USD equivalents. Other-currency cash does not count without a simulated conversion; mixed-currency needs still require separate verification.

## Candidate generation

Five educational mixes are tested: spending reserve, income and stability, balanced global, diversified growth, and defensive complement. They use goal-currency cash and USD short-government, investment-grade-credit, broad-equity and gold proxies from the existing model.

A sixth, goal-funded core, is generated for the selected client/account. It first allocates enough eligible cash to the reserve target, then distributes remaining eligible assets toward account mandate minima, targets and maxima. Frozen holdings are subtracted before allocation. If the requirements cannot fit the available amount, a funded diagnostic mix is still evaluated and remains blocked by the independent gates; it is not described as feasible.

All six are compared with retaining the current mix. The search uses 5% steps in the percentage of eligible holdings reshaped, capped by the RM input. It also tests the exact fraction at which each candidate funds the reserve target. This is a finite catalogue search, not optimisation over all investments. All source accounts keep their value; no new capital or debt is created.

Only daily-dealing assets in the selected, unpledged bank advisory/discretionary account can fund a transition. Custody, external, collateral, weekly/monthly, gated and private positions remain unchanged. Source positions at a loss or with missing cost basis are also fixed for Cheung, in line with N-016. Ravi’s N-003 no-listed-sales instruction blocks all proposed reallocations; his N-004 borrowing/collateral concern is shown.

## Mandatory gates

1. All numeric inputs are valid and at least one active goal has the needed input. Negative reserves, blank required inputs, unsupported currencies and non-finite values cannot be silently treated as zero.
2. The proposed change has eligible existing funding.
3. The entered horizon meets the demo model’s minimum.
4. The target account passes source allocation, eligible single-position and sustainability rules.
5. Goal-currency unpledged cash meets the entered reserve, even if its ranking weight is zero.
6. Combined wealth remains within the draft loss limit in every modelled price/FX scenario.
7. Explicit values rules have no source conflicts or unresolved screening. Any faith-based request needs specialist review, including cash, interest and debt; identities never infer beliefs.
8. No source facility lies within a 2% relative distance to its LTV trigger. This is a demo review control, not a bank policy or lending approval. Other-bank gains cannot satisfy it.

Passing these gates only qualifies an option for conditional RM review. Complete wealth, ownership, tax, costs, product eligibility, payment schedules, screening and client consent remain prerequisites to advice. Income shortfalls are explicit trade-offs, not hidden by the rank. A blocked option cannot be shortlisted in the UI, but its rejection or change request can be saved.

## Score and explanations

Version `goal-match-1.2` separates an untested model template from a tested portfolio. If there is no funded transition, its score, score change and contribution breakdown are unavailable; it cannot inherit the current portfolio's score. A zero change cap has its own explanation. Missing usable goals also produce no score, rather than a numeric zero. The current portfolio keeps its own diagnostic score when goals are available, even if other gates fail.

Each scored candidate reports its change from the current portfolio under identical inputs. The UI shows two decimal places, current versus proposed goal contributions, and the exact reason for an unavailable score. An unfunded template has no proposed allocation, income or stress result in the UI or saved review. Its source holdings remain available internally for gate diagnostics. Numeric diagnostic scores for funded but blocked options do not make them eligible for a shortlist. Scores measure goal fit; predictive model accuracy has not been measured.

Active priorities split 90 points. The remaining 10 points reward avoiding unnecessary changes. Each score component is in [0,100]; points = component fit × weight / 100. Weights are normalised and displayed.

- Cash: goal-currency unpledged cash / reserve target, capped at 100%.
- Income: the lower annual income estimate after loan interest / spending need. If requested gross yield exists, use the smaller of income coverage and gross-yield coverage. Fees, tax and lender retention are not deducted or assumed away.
- Loss capacity: 100 × (1 − worst tested loss / draft loss limit), bounded to [0,100].
- Growth participation: broad-equity share / reference account equity target, capped at 100%. This is not a predicted return or an approved target allocation.
- Shared concentration: 100 minus the largest of direct-position share, identified technology share or the stated source-of-wealth sector proxy. Incomplete fund look-through is disclosed.
- Change burden: 100 minus the percentage of combined assets reshaped. This is not an estimated fee or tax saving.

Cash and income components without numeric targets are omitted; their weight is reallocated to active goals. If no usable goals remain, the engine abstains. Each model retains its highest-scoring gate-passing transition. If none passes, its fewest-failures diagnostic variant is shown with no rank; unfunded variants are unscored. The search uses full-precision scores. Genuine ties use smaller change amount, then stable model identifier, and are never altered to create artificial score differences. Capped goal contributions can tie even for different holdings. The source/client name does not enter scoring.

The RM sees the selected mix, actual resulting account and household weights, before/after cash and income, source-of-wealth overlap, all five price/FX stress results, each gate, each score contribution, why alternatives differ, remaining gaps and exact source records. The separate six-month funding test remains in Stress & decisions.

## Feedback and audit

“Apply draft feedback” sets the chosen goal to 5 and caps the others at 2. It reranks the simulation without relaxing cash, horizon, mandate, loss, values or credit gates. It does not train a model or change the client record.

The RM can record a shortlist, change request or rejection with a reason. The existing local decision ledger saves engine version, source date, inputs, external examples, candidate, allocation, score components, gate results, stress/income effects and source evidence. This is explicitly not client/trade approval. No message or trade is sent. Draft recommendation controls remain through tab changes but reset when leaving the client.

## Validation

`tests/recommendations.test.mjs` checks all 20 clients, conservation of assets, bounded/auditable scores, hard-gate precedence, different client mixes, Ravi’s abstention, Cheung’s reserve/no-loss constraints, exact reserve breakpoints, missing goals/screening, horizon limits, shared external context, currency selection, yield sensitivity and feedback thresholds. Run with the existing whole-wealth model tests. The focused `tests/rm-review.test.mjs` suite covers invalid-input abstention, shared client sale constraints, cash currency, funding gaps and local record/notification failures. Browser testing is separate.
