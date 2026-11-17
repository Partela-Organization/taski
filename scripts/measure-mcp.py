"""Measure actual SDK tools/list and tools/call results, never a projected catalog."""
import json
import sys
from importlib.metadata import version
from pathlib import Path
import tiktoken

data = json.load(sys.stdin)
encoder = tiktoken.get_encoding("o200k_base")
def size(value):
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return {"tokensProxy": len(encoder.encode(serialized, disallowed_special=())), "utf8Bytes": len(serialized.encode())}

catalog = size({"instructions": data["instructions"], **data["catalog"]})
per_tool = {tool["name"]: size(tool) for tool in data["catalog"]["tools"]}
measurements = {"catalog_with_instructions": catalog, "list_20": size(data["list"]), "create_receipt": size(data["receipt"])}
budgets = {"catalog_with_instructions": 4000, "list_20": 1600, "create_receipt": 200}
report = {"kind": "proxy_not_agent_usage", "encoding": "o200k_base", "tiktoken": version("tiktoken"),
          "sdk": data["sdk"], "protocol": "legacy stateless Streamable HTTP",
          "serialization": "json.dumps ensure_ascii=False sort_keys=True separators=(',', ':')",
          "representation": "SDK results including content and structuredContent plus server instructions; no RPC ids/headers",
          "fixtures": "20 create-and-assign calls; fixed epoch in isolated D1 only; no production data",
          "measured": measurements, "budgets": budgets, "per_tool": per_tool,
          "deferred_loading": "per-tool sizes only; actual host-loaded definitions are measured separately in B6-03",
          "realUsage": None, "latency": None, "superiorityOverLinear": "NOT_DEMONSTRATED",
          "passed": all(measurements[k]["tokensProxy"] <= limit for k, limit in budgets.items())}
serialized = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
target = Path(__file__).resolve().parents[1] / "docs/benchmarks/b6-mcp-results.json"
if "--check" in sys.argv:
    if not target.exists() or target.read_text() != serialized:
        raise SystemExit("MCP results changed; run npm run mcp:measure -- --write and review the report.")
    print("OK: reproducible MCP SDK report and all three proxy budgets.")
else:
    if "--write" in sys.argv:
        target.write_text(serialized)
    print(serialized, end="")
sys.exit(0 if report["passed"] else 1)
