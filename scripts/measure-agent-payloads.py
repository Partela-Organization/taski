"""Proxy counts for recorded fixture objects, never host/model billing units."""
import json
import sys
from importlib.metadata import version
import tiktoken

encoder = tiktoken.get_encoding("o200k_base")
values = json.load(sys.stdin)
result = {}
for name, value in values.items():
    serialized = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    result[name] = {"utf8Bytes": len(serialized.encode()), "tokensProxy": len(encoder.encode(serialized, disallowed_special=()))}
print(json.dumps({"metrics": result, "tokenizerVersion": version("tiktoken"), "encoding": "o200k_base"}))
