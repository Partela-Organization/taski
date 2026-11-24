import { readFile, writeFile } from "node:fs/promises";
import { design, designDigest, schedule } from "./benchmark-design.mjs";
import { evaluate } from "./benchmark-evaluate.mjs";

const [command, ...args] = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!["--input", "--output"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || options[args[i]]) {
    throw new Error("Usage: node scripts/benchmark.mjs plan [--output file] | report --input runs.jsonl [--output file]");
  }
  options[args[i]] = args[i + 1];
}
let report;
if (command === "plan" && !options["--input"]) {
  report = { ...design, designDigest, schedule: [...schedule()] };
} else if (command === "report" && options["--input"]) {
  const contents = await readFile(options["--input"], "utf8");
  const records = contents.split("\n").filter((line) => line.trim()).map((line, i) => {
    try { return JSON.parse(line); } catch { throw new Error(`Invalid JSON on line ${i + 1}`); }
  });
  report = evaluate(records);
  if (report.status !== "TARGETS_MET_REVIEW_REQUIRED") process.exitCode = 2;
} else throw new Error("Use plan or report --input runs.jsonl");
const serialized = JSON.stringify(report, null, 2) + "\n";
if (options["--output"]) await writeFile(options["--output"], serialized);
else process.stdout.write(serialized);
