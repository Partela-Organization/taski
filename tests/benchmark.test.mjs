import assert from "node:assert/strict";
import { test } from "node:test";
import { design, designDigest, schedule } from "../scripts/benchmark-design.mjs";
import { distribution, evaluate, realTokens } from "../scripts/benchmark-evaluate.mjs";

// Explicitly synthetic arithmetic cases, never published as measured evidence.
const digest = "a".repeat(64);
function synthetic() {
  return [...schedule()].map((row, i) => {
    const factor = row.provider === "taski" ? 0.5 : 1;
    const latencyMs = 1000 * factor;
    const startedAt = new Date(Date.UTC(2026, 0, 1) + i * 10000).toISOString();
    return { ...row, kind: "LIVE_COMPARATIVE_RUN", runId: `synthetic-${i}`, commit: "b".repeat(40), fixtureSha256: digest,
      promptSha256: digest, traceSha256: digest, model: `same-${row.host}`, hostVersion: "test-1", connectorVersion: "test-1",
      server: { identity: row.provider, environment: "remote-test", version: "test-1", region: "test" },
      cache: design.cache, comparator: "optimized", correct: true, failure: null, latencyMs, startedAt,
      confirmedAt: new Date(Date.parse(startedAt) + latencyMs).toISOString(), setupMs: 1, restoreMs: 1,
      calls: 2, rounds: 1, errors: 0, retries: 0,
      usage: row.host === "codex" ? { scope: "invocation", source: "client", input_tokens: 80 * factor,
        output_tokens: 20 * factor, cached_input_tokens: 10 * factor }
        : { scope: "invocation", source: "client", input_tokens: 60 * factor, output_tokens: 20 * factor,
          cache_creation_input_tokens: 10 * factor, cache_read_input_tokens: 10 * factor },
      payloadProxy: { argumentBytes: 1, resultBytes: 2, argumentTokens: 1, resultTokens: 1 },
      evidence: Object.fromEntries(design.mechanisms.map((key) => [key, digest])) };
  });
}

test("benchmark registers balanced paired order and equal scenario-family weights", () => {
  const rows = [...schedule()];
  assert.equal(rows.length, 3240);
  assert.equal(new Set(rows.map((r) => `${r.pairId}/${r.provider}`)).size, rows.length);
  assert.equal(design.scenarios.reduce((sum, s) => sum + s.weight, 0), 8);
  assert(rows.every((r) => r.designDigest === designDigest));
  for (let i = 0; i < rows.length; i += 2) {
    assert.equal(rows[i].pairId, rows[i + 1].pairId);
    assert.notEqual(rows[i].provider, rows[i + 1].provider);
    assert.equal(rows[i].provider, rows[i].repetition % 2 ? "taski" : "linear");
  }
});

test("benchmark never substitutes proxy or cumulative totals for unavailable real usage", () => {
  assert.equal(realTokens({ scope: "invocation", source: "client", input_tokens: 100, output_tokens: 10, cached_input_tokens: 80 }, "codex"), 110);
  assert.equal(realTokens({ scope: "invocation", source: "client", input_tokens: 5, output_tokens: 10, cache_creation_input_tokens: 20, cache_read_input_tokens: 30 }, "claude"), 65);
  assert.equal(realTokens({ scope: "session-cumulative", source: "client", input_tokens: 100, output_tokens: 10, cached_input_tokens: 0 }, "codex"), null);
  assert.equal(realTokens({ scope: "invocation", source: "proxy", input_tokens: 100, output_tokens: 10, cached_input_tokens: 0 }, "codex"), null);
  assert.equal(realTokens({ scope: "invocation", source: "client", input_tokens: 10, output_tokens: 1, cached_input_tokens: 20 }, "codex"), null);
  assert.equal(realTokens(null, "claude"), null);
  assert.equal(evaluate([]).status, "NOT_DEMONSTRATED");
});

test("benchmark requires complete conditions, comparable versions and measured mechanisms", () => {
  const records = synthetic();
  assert.equal(evaluate(records).status, "TARGETS_MET_REVIEW_REQUIRED");
  assert.equal(evaluate(records.slice(1)).status, "NOT_DEMONSTRATED");
  for (const mutate of [
    (r) => { r.model = "different"; },
    (r) => { r.server.environment = "local"; },
    (r) => { r.evidence["loaded-definitions"] = null; },
    (r) => { r.usage.scope = "session-cumulative"; },
  ]) {
    const modified = structuredClone(records); mutate(modified[0]);
    assert.equal(evaluate(modified).status, "NOT_DEMONSTRATED");
  }
});

test("benchmark rejects duplicates, changed ordering and unregistered or proxy evidence", () => {
  const records = synthetic();
  assert.throws(() => evaluate([...records, records[0]]), /Duplicate/);
  for (const mutate of [
    (r) => { r.kind = "PAYLOAD_PROXY"; },
    (r) => { r.designDigest = "c".repeat(64); },
    (r) => { r.position = 1; },
    (r) => { r.repetition = 31; },
    (r) => { r.payloadProxy.resultTokens = -1; },
    (r) => { r.confirmedAt = r.startedAt; },
  ]) {
    const modified = structuredClone(records); mutate(modified[0]);
    assert.throws(() => evaluate(modified));
  }
  const reversed = structuredClone(records);
  reversed[0].startedAt = reversed[1].confirmedAt;
  reversed[0].confirmedAt = new Date(Date.parse(reversed[0].startedAt) + reversed[0].latencyMs).toISOString();
  assert.throws(() => evaluate(reversed), /ordering/);
});

test("benchmark retains failures and exposes p95 regressions despite passing token/p50 targets", () => {
  const records = synthetic();
  const selected = records.filter((r) => r.host === "codex" && r.context === "new" && r.scenario === "progress-state" && r.provider === "taski");
  for (const r of selected.slice(0, 2)) {
    r.latencyMs = 2000; r.confirmedAt = new Date(Date.parse(r.startedAt) + r.latencyMs).toISOString();
  }
  let report = evaluate(records);
  assert.equal(report.status, "TARGETS_MET_REVIEW_REQUIRED");
  assert(report.cohorts[0].regressions.includes("progress-state"));
  selected[0].correct = false; selected[0].failure = "confirmation-failed"; selected[0].errors = 1;
  report = evaluate(records);
  assert.equal(report.status, "TARGETS_NOT_MET");
  const row = report.cohorts[0].scenarios.find((s) => s.scenario === "progress-state");
  assert.equal(row.taski.attempts, 30); assert.equal(row.taski.latencyMs.n, 30); assert.equal(row.taski.realTokens.n, 30);
  assert.equal(row.taski.correct, 29); assert.equal(row.taski.failures[0].category, "confirmation-failed");
});

test("benchmark reports percentiles consistently and fails a slow composed scenario", () => {
  assert.equal(distribution(Array.from({ length: 30 }, (_, i) => i + 1)).p95, 29);
  assert.equal(distribution([1, 2, 3, 4]).p50, 2);
  const records = synthetic();
  for (const r of records.filter((r) => r.scenario === "read-context" && r.provider === "taski")) {
    r.latencyMs = 900; r.confirmedAt = new Date(Date.parse(r.startedAt) + r.latencyMs).toISOString();
  }
  assert.equal(evaluate(records).status, "TARGETS_NOT_MET");
});
