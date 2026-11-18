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

def publish(value, filename, variable_tokens=()):
    target = Path(__file__).resolve().parents[1] / "docs/benchmarks" / filename
    serialized = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    if not value["passed"]:
        raise SystemExit("MCP proxy budget exceeded: " + serialized)
    if "--check" in sys.argv:
        expected = json.loads(target.read_text()) if target.exists() else None
        actual = json.loads(serialized)
        # Real SDK responses carry random UUIDs and server timestamps. Compare all
        # bytes/flows/metadata exactly; check live proxy budgets on every run.
        for document in [expected, actual]:
            if document is not None:
                for name in variable_tokens:
                    document["measured"][name]["tokensProxy"] = None
        if expected != actual:
            raise SystemExit(f"{filename} changed; run npm run mcp:measure -- --intent --write and review the report.")
        print(f"OK: {filename}; live budgets and reproducible bytes, flows and metadata.")
        if variable_tokens:
            print("Live variable token counts: " + json.dumps({name: value["measured"][name]["tokensProxy"] for name in variable_tokens}))
    else:
        if "--write" in sys.argv:
            target.write_text(serialized)
            print(f"Wrote {filename}; proxy budgets passed.")
        else:
            print(serialized, end="")


publish(report, "b6-mcp-results.json")
if "intent" in data:
    intent = data["intent"]
    measurements = {name: size(value) for name, value in intent["artifacts"].items()}
    budgets = {"ordinary_update_receipt": 200, "pr_state_receipt": 200, "patch_progress_receipt": 200}
    variable = ["work_read", "full_read", "ordinary_update_receipt", "patch_progress_receipt", "activity_pages",
                "recovery_full_read", "older_comments", "long_patch_activity", "long_full_read"]
    report = {"kind": "SDK_INTENT_PROXY", "sdk": data["sdk"], "tokenizer": f"tiktoken=={version('tiktoken')}/o200k_base",
              "protocol": "legacy stateless Streamable HTTP", "samplesPerArtifact": 1,
              "serialization": "json.dumps ensure_ascii=False sort_keys=True separators=(',', ':')",
              "scope": "Isolated local Worker/D1 and SDK; fixture preparation, handshake and discovery excluded from scenario calls/rounds",
              "representation": "Actual SDK results with content/structuredContent; long inputs are arguments; no JSON-RPC ids/HTTP headers",
              "measured": measurements, "budgetsProxy": budgets, "flows": intent["flows"], "integrity": intent["integrity"],
              "variableTokenMetrics": variable,
              "checkPolicy": "Exact bytes/metadata/flows and deterministic token counts; variable token samples may differ due to real UUIDs/timestamps; live budgets always enforced",
              "realUsage": None, "latency": None, "linearExecution": "NOT_MEASURED", "superiorityOverLinear": "NOT_DEMONSTRATED",
              "passed": all(measurements[name]["tokensProxy"] <= limit for name, limit in budgets.items())}
    publish(report, "b6-intent-results.json", variable)
