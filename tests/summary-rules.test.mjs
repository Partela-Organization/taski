import assert from "node:assert/strict";
import { test } from "node:test";
import { daysBetween, localDate, percent, progressBar, progressText, trackHealth } from "../src/domain/summary.ts";
import { parseConfiguration } from "../src/config/schema.ts";
import { demoPreset } from "../src/config/presets/demo.ts";

test("track health follows the agreed thresholds", () => {
  const today = "2026-11-27";
  const cases = [
    [null, 0, 10, "none"],
    ["2026-11-25", 5, 6, "late"],
    ["2026-11-25", 6, 6, "ok"],          // finished after the date is not late
    ["2026-11-26", 0, 0, "ok"],          // nothing to do
    ["2026-11-27", 9, 10, "ok"],         // 10% pending on the day itself
    ["2026-11-27", 7, 10, "risk"],       // exactly 7 days or less and ≥25% pending
    ["2026-12-04", 7, 10, "risk"],
    ["2026-12-04", 8, 10, "ok"],         // 20% pending
    ["2026-12-05", 0, 10, "ok"],         // eight days left
    ["2026-12-04", 0, 0, "ok"],
  ];
  for (const [date, done, total, expected] of cases) assert.equal(trackHealth(date, done, total, today), expected, `${date} ${done}/${total}`);
});

test("calendar arithmetic is per local day and ignores DST", () => {
  assert.equal(daysBetween("2026-11-27", "2026-12-01"), 4);
  assert.equal(daysBetween("2026-12-01", "2026-11-27"), -4);
  assert.equal(daysBetween("2026-03-07", "2026-03-09"), 2);
  assert.equal(daysBetween("2026-12-31", "2027-01-01"), 1);
  // 01:30 UTC on the 28th is still the 27th in Caracas (UTC-4) and already the 28th in Madrid.
  assert.equal(localDate("2026-11-28T01:30:00.000Z", "America/Caracas"), "2026-11-27");
  assert.equal(localDate("2026-11-28T01:30:00.000Z", "Europe/Madrid"), "2026-11-28");
  assert.equal(localDate("2026-11-28T01:30:00.000Z", "UTC"), "2026-11-28");
});

test("progress text aligns one bar per track plus total", () => {
  assert.equal(percent(7, 12), 58); assert.equal(percent(0, 0), 0);
  assert.equal(progressBar(0), "░░░░░░░░░░"); assert.equal(progressBar(54), "▓▓▓▓▓░░░░░"); assert.equal(progressBar(100), "▓▓▓▓▓▓▓▓▓▓");
  const text = progressText("Proyecto demo · vie 27 nov", [{ label: "Pagos", percent: 58 }, { label: "Reparto por unidad", percent: 40 }], 54);
  assert.equal(text, [
    "Proyecto demo · vie 27 nov",
    "",
    "Pagos              ▓▓▓▓▓▓░░░░  58%",
    "Reparto por unidad ▓▓▓▓░░░░░░  40%",
    "",
    "Total              ▓▓▓▓▓░░░░░  54%",
  ].join("\n"));
  const long = progressText("H", [{ label: "Un track con un nombre demasiado largo", percent: 100 }], 100).split("\n")[2];
  assert.equal(long, "Un track con un nombr… ▓▓▓▓▓▓▓▓▓▓ 100%");
});

test("timezone is optional, defaults to UTC and must be an IANA zone", () => {
  assert.equal(parseConfiguration(demoPreset).timezone, "UTC");
  assert.equal(parseConfiguration({ ...demoPreset, timezone: "America/Caracas" }).timezone, "America/Caracas");
  assert.throws(() => parseConfiguration({ ...demoPreset, timezone: "Mars/Olympus" }), /timezone: expected an IANA time zone/);
  assert.throws(() => parseConfiguration({ ...demoPreset, timezone: "" }), /timezone/);
});
