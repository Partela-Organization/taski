import { createHash } from "node:crypto";

// Register weights/conditions before collecting any performance samples.
export const design = {
  version: 1,
  kind: "COMPARATIVE_BENCHMARK_DESIGN",
  minimumPairs: 30,
  providers: ["taski", "linear"],
  contexts: ["new", "prior"],
  conditions: [
    { host: "codex", loading: "default" },
    { host: "claude", loading: "eager" },
    { host: "claude", loading: "deferred" },
  ],
  scenarios: [
    { id: "assigned-10", weight: 0.5, composed: false },
    { id: "assigned-20", weight: 0.5, composed: false },
    { id: "read-context", weight: 1, composed: true },
    { id: "create-assign", weight: 1, composed: true },
    { id: "progress-state", weight: 1, composed: true },
    { id: "pr-state", weight: 1, composed: true },
    { id: "resume-context", weight: 1, composed: false },
    { id: "patch-long", weight: 1, composed: false },
    { id: "failure-recovery", weight: 1, composed: false },
  ],
  mechanisms: ["loaded-definitions", "composed-operations", "context-reuse", "compact-and-full"],
  gates: { tokenReduction: 0.25, composedP50Reduction: 0.20 },
  cache: "uncontrolled-observed",
  percentile: "nearest-rank",
  aggregation: "Weighted scenario means for total real tokens; each composed scenario must meet the p50 target; no aggregation across host/loading/context",
};
export const designDigest = createHash("sha256").update(JSON.stringify(design)).digest("hex");

export function* schedule() {
  for (const condition of design.conditions) for (const context of design.contexts) {
    for (const scenario of design.scenarios) for (let repetition = 0; repetition < design.minimumPairs; repetition++) {
      const order = repetition % 2 ? ["linear", "taski"] : ["taski", "linear"];
      const pairId = `${condition.host}/${condition.loading}/${context}/${scenario.id}/${repetition + 1}`;
      for (const [position, provider] of order.entries()) yield {
        pairId, ...condition, context, scenario: scenario.id, repetition: repetition + 1, position, provider, designDigest,
      };
    }
  }
}
