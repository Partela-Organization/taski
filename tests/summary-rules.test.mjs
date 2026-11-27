import assert from "node:assert/strict";
import { test } from "node:test";
import { daysBetween, localDate, percent, progressBar, progressLine, progressText, trackHealth } from "../src/domain/summary.ts";
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

test("progress text follows the team's Telegram style", () => {
  assert.equal(percent(7, 12), 58); assert.equal(percent(0, 0), 0);
  assert.equal(progressBar(0), "░░░░░░░░░░"); assert.equal(progressBar(54), "▓▓▓▓▓░░░░░"); assert.equal(progressBar(100), "▓▓▓▓▓▓▓▓▓▓");
  // Same line as `tg pendientes`: bar, space before %, done/total.
  assert.equal(progressLine(2, 18), "▓░░░░░░░░░ 11 % · 2/18");
  assert.equal(progressLine(0, 0), "—");
  const track = (label, health, targetDate, done, total, next) => ({ label, health, targetDate, done, total, next: next ? { title: next } : null });
  const text = progressText("Proyecto demo · vie 27 nov", [
    track("Accesos y llaves", "late", "2026-11-25", 5, 6, "Entregar copias de llaves a la unidad 4B"),
    track("Pagos", "risk", "2026-12-01", 7, 12, "Conciliar transferencias de noviembre"),
    track("Limpieza", "ok", "2026-12-12", 6, 8, "Confirmar turno del fin de semana"),
    track("Comunicación", "none", null, 0, 0, null),
  ], { done: 18, total: 26 });
  assert.equal(text, [
    "📋 Proyecto demo · vie 27 nov  ▓▓▓▓▓▓▓░░░ 69 % · 18/26",
    "Accesos y llaves  ▓▓▓▓▓▓▓▓░░ 83 % · 5/6 · ⚠️ venció 25 nov",
    "Pagos  ▓▓▓▓▓▓░░░░ 58 % · 7/12 · ⚠️ vence 1 dic",
    "Limpieza  ▓▓▓▓▓▓▓▓░░ 75 % · 6/8",
    "Comunicación  —",
    "",
    "▶ Accesos y llaves: Entregar copias de llaves a la unidad 4B",
    "• Pagos: Conciliar transferencias de noviembre",
    "• Limpieza: Confirmar turno del fin de semana",
  ].join("\n"));
  const long = progressText("H", [track("Mantenimiento", "ok", "2026-12-19", 0, 3, "Pedir presupuesto de la bomba de agua del edificio norte y del sur")], { done: 0, total: 3 });
  assert.equal(long.split("\n").at(-1), "▶ Mantenimiento: Pedir presupuesto de la bomba de agua del …");
  assert.equal(progressText("H", [track("Web", "ok", null, 1, 1, null)], { done: 1, total: 1 }).split("\n").length, 2);
});

test("timezone is optional, defaults to UTC and must be an IANA zone", () => {
  assert.equal(parseConfiguration(demoPreset).timezone, "UTC");
  assert.equal(parseConfiguration({ ...demoPreset, timezone: "America/Caracas" }).timezone, "America/Caracas");
  assert.throws(() => parseConfiguration({ ...demoPreset, timezone: "Mars/Olympus" }), /timezone: expected an IANA time zone/);
  assert.throws(() => parseConfiguration({ ...demoPreset, timezone: "" }), /timezone/);
});
