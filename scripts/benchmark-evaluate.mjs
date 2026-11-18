import assert from "node:assert/strict";
import { design, designDigest, schedule } from "./benchmark-design.mjs";

const number = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0;
const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length;
const hash = (value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

export function distribution(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const average = mean(sorted);
  return { n: sorted.length, mean: average, min: sorted[0], max: sorted.at(-1),
    p50: sorted[Math.ceil(sorted.length * 0.5) - 1], p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    standardDeviation: Math.sqrt(mean(sorted.map((n) => (n - average) ** 2))) };
}

// Never treat payload proxies or cumulative session totals as task usage.
export function realTokens(usage, host) {
  if (!usage || usage.scope !== "invocation" || usage.source !== "client") return null;
  const keys = host === "codex" ? ["input_tokens", "output_tokens", "cached_input_tokens"]
    : ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"];
  if (!keys.every((key) => number(usage[key]) && Number.isInteger(usage[key]))) return null;
  if (host === "codex") {
    if (usage.cached_input_tokens > usage.input_tokens) return null;
    return usage.input_tokens + usage.output_tokens; // cached input is already included.
  }
  return keys.reduce((sum, key) => sum + usage[key], 0); // Claude input excludes its cache counters.
}

function validate(record, expected) {
  assert.equal(record.kind, "LIVE_COMPARATIVE_RUN", "Only measured live comparative runs are accepted");
  for (const key of ["designDigest", "pairId", "host", "loading", "context", "scenario", "repetition", "position", "provider"]) {
    assert.equal(record[key], expected[key], `Invalid or out-of-schedule ${key}`);
  }
  assert(typeof record.runId === "string" && record.runId.length, "Missing runId");
  assert(/^[a-f0-9]{40}$/.test(record.commit), "Missing full source commit");
  assert(hash(record.fixtureSha256) && hash(record.promptSha256) && hash(record.traceSha256), "Missing fixture/prompt/trace hashes");
  for (const key of ["model", "hostVersion", "connectorVersion"]) assert(typeof record[key] === "string" && record[key].length, `Missing ${key}`);
  assert(record.server && ["local", "remote-test"].includes(record.server.environment), "Missing server environment");
  for (const key of ["identity", "version", "region"]) assert(typeof record.server[key] === "string" && record.server[key].length, `Missing server ${key}`);
  assert.equal(record.cache, design.cache, "Cache conditions differ from registration");
  assert.equal(record.comparator, "optimized", "The primary comparator must be optimized");
  assert(typeof record.correct === "boolean", "Missing externally checked correctness");
  assert(number(record.latencyMs) && record.latencyMs > 0, "Missing task latency, including discovery/recovery/confirmation");
  const start = Date.parse(record.startedAt), end = Date.parse(record.confirmedAt);
  assert(Number.isFinite(start) && Number.isFinite(end) && end > start && Math.abs(end - start - record.latencyMs) <= 2,
    "Task timestamps must cover instruction through confirmed result");
  assert(number(record.setupMs) && number(record.restoreMs), "Separate fixture setup and restoration");
  assert(Number.isInteger(record.calls) && record.calls >= 0 && Number.isInteger(record.rounds) && record.rounds >= 0, "Missing calls/rounds");
  assert(Number.isInteger(record.errors) && record.errors >= 0 && Number.isInteger(record.retries) && record.retries >= 0, "Missing errors/retries");
  assert(!record.correct || record.calls > 0, "Correctness requires actual tool execution");
  assert(record.rounds <= record.calls && (record.calls === 0) === (record.rounds === 0), "Rounds must represent nonempty tool-call batches");
  assert(record.failure === null || typeof record.failure === "string", "Failure must be a sanitized category or null");
  assert(record.correct || record.failure, "Failed samples must retain their failure category");
  assert(record.payloadProxy && ["argumentBytes", "resultBytes", "argumentTokens", "resultTokens"].every((key) => number(record.payloadProxy[key]) && Number.isInteger(record.payloadProxy[key])), "Missing separately measured payload proxies");
  assert(record.evidence && design.mechanisms.every((key) => record.evidence[key] === null || hash(record.evidence[key])), "Mechanism evidence must be an artifact SHA-256 or null");
}

function summarize(records, host) {
  const tokens = records.map((record) => realTokens(record.usage, host));
  return { attempts: records.length, correct: records.filter((record) => record.correct).length,
    failures: records.filter((record) => !record.correct).map((record) => ({ runId: record.runId, category: record.failure })),
    errors: records.reduce((n, record) => n + record.errors, 0), retries: records.reduce((n, record) => n + record.retries, 0),
    latencyMs: distribution(records.map((record) => record.latencyMs)),
    realTokens: tokens.every((value) => value !== null) ? distribution(tokens) : null,
    usageUnavailable: tokens.filter((value) => value === null).length,
    usageCounters: Object.fromEntries((host === "codex" ? ["input_tokens", "output_tokens", "cached_input_tokens"]
      : ["input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"])
      .map((key) => [key, tokens.every((value) => value !== null) ? distribution(records.map((record) => record.usage[key])) : null])),
    calls: distribution(records.map((record) => record.calls)), rounds: distribution(records.map((record) => record.rounds)),
    payloadProxy: Object.fromEntries(["argumentBytes", "resultBytes", "argumentTokens", "resultTokens"]
      .map((key) => [key, distribution(records.map((record) => record.payloadProxy[key]))])) };
}

export function evaluate(records) {
  const expected = new Map([...schedule()].map((row) => [`${row.pairId}/${row.provider}`, row]));
  const found = new Map(), runIds = new Set();
  for (const record of records) {
    const key = `${record.pairId}/${record.provider}`;
    assert(expected.has(key), "Unexpected scenario, condition, repetition or provider");
    validate(record, expected.get(key));
    assert(!found.has(key) && !runIds.has(record.runId), "Duplicate sample or runId");
    found.set(key, record); runIds.add(record.runId);
  }
  for (const row of expected.values()) {
    if (row.position !== 0) continue;
    const first = found.get(`${row.pairId}/${row.provider}`);
    const second = found.get(`${row.pairId}/${row.provider === "taski" ? "linear" : "taski"}`);
    if (first && second) assert(Date.parse(first.confirmedAt) <= Date.parse(second.startedAt), "Observed pair ordering differs from registration");
  }
  const cohorts = [];
  for (const condition of design.conditions) for (const context of design.contexts) {
    const reasons = [], scenarios = [];
    const subset = records.filter((r) => r.host === condition.host && r.loading === condition.loading && r.context === context);
    const signatures = subset.map((r) => JSON.stringify([r.commit, r.fixtureSha256, r.model, r.hostVersion]));
    if (new Set(signatures).size > 1) reasons.push("Source, fixtures, model or host version changed within the comparison");
    for (const provider of design.providers) {
      const versions = subset.filter((r) => r.provider === provider).map((r) => JSON.stringify([r.connectorVersion, r.server]));
      if (new Set(versions).size > 1) reasons.push(`${provider}: connector/server changed within the comparison`);
    }
    if (subset.some((r) => r.server.environment !== "remote-test")) reasons.push("Local server samples do not demonstrate the deployed comparison");
    for (const scenario of design.scenarios) {
      const samples = Object.fromEntries(design.providers.map((provider) => [provider,
        subset.filter((r) => r.scenario === scenario.id && r.provider === provider)]));
      const taski = summarize(samples.taski, condition.host), linear = summarize(samples.linear, condition.host);
      if (taski.attempts !== design.minimumPairs || linear.attempts !== design.minimumPairs) reasons.push(`${scenario.id}: requires ${design.minimumPairs} complete pairs`);
      if (!taski.realTokens || !linear.realTokens || !taski.attempts || !linear.attempts) reasons.push(`${scenario.id}: real client usage unavailable`);
      if (!taski.correct || !linear.correct) reasons.push(`${scenario.id}: no successful equivalent task for both providers`);
      const tokenRatio = taski.realTokens && linear.realTokens?.mean > 0 ? taski.realTokens.mean / linear.realTokens.mean : null;
      const p50Ratio = taski.latencyMs && linear.latencyMs ? taski.latencyMs.p50 / linear.latencyMs.p50 : null;
      const p95Ratio = taski.latencyMs && linear.latencyMs ? taski.latencyMs.p95 / linear.latencyMs.p95 : null;
      scenarios.push({ scenario: scenario.id, weight: scenario.weight, composed: scenario.composed, taski, linear,
        tokenRatio, p50Ratio, p95Ratio, p95Regression: p95Ratio !== null && p95Ratio > 1 });
    }
    const mechanisms = Object.fromEntries(design.mechanisms.map((key) => [key,
      subset.length > 0 && subset.every((r) => hash(r.evidence[key])) ? "recorded" : "unavailable"]));
    if (Object.values(mechanisms).some((value) => value === "unavailable")) reasons.push("Mechanism evidence incomplete; artifact hashes require human review");
    const total = (provider) => scenarios.reduce((sum, row) => sum + row.weight * (row[provider].realTokens?.mean ?? 0), 0);
    const aggregateTokenRatio = reasons.length ? null : total("linear") > 0 ? total("taski") / total("linear") : null;
    if (!reasons.length && aggregateTokenRatio === null) reasons.push("Real token baseline is zero");
    const targetsMet = aggregateTokenRatio !== null && aggregateTokenRatio <= 1 - design.gates.tokenReduction
      && scenarios.filter((r) => r.composed).every((r) => r.p50Ratio <= 1 - design.gates.composedP50Reduction)
      && scenarios.every((r) => r.taski.correct >= r.linear.correct);
    const regressions = scenarios.filter((r) => r.p95Regression).map((r) => r.scenario);
    cohorts.push({ ...condition, context, scenarios, mechanisms, aggregateTokenRatio, regressions,
      status: reasons.length ? "NOT_DEMONSTRATED" : targetsMet ? "TARGETS_MET_REVIEW_REQUIRED" : "TARGETS_NOT_MET", reasons });
  }
  return { kind: "COMPARATIVE_BENCHMARK_EVALUATION", designDigest, expectedAttempts: expected.size, attempts: records.length,
    missingAttempts: expected.size - found.size, cohorts,
    status: cohorts.some((c) => c.status === "NOT_DEMONSTRATED") ? "NOT_DEMONSTRATED"
      : cohorts.some((c) => c.status === "TARGETS_NOT_MET") ? "TARGETS_NOT_MET" : "TARGETS_MET_REVIEW_REQUIRED",
    review: "Thresholds never accept the gate automatically. Review evidence artifacts, equivalence, optimization, deployment and p95 regressions before accepting B6-04." };
}
