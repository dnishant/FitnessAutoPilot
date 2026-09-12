#!/usr/bin/env bash
# Sync pure domain/contracts/validation/llm into Edge Functions _shared.
# Run after changing packages/domain|contracts|validation|llm.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHARED="$ROOT/supabase/functions/_shared"
rm -rf "$SHARED/domain" "$SHARED/contracts" "$SHARED/validation" "$SHARED/llm"
mkdir -p "$SHARED/domain" "$SHARED/contracts" "$SHARED/validation" "$SHARED/llm"
cp -R "$ROOT/packages/domain/src/." "$SHARED/domain/"
cp -R "$ROOT/packages/contracts/src/." "$SHARED/contracts/"
cp -R "$ROOT/packages/validation/src/." "$SHARED/validation/"
cp -R "$ROOT/packages/llm/src/." "$SHARED/llm/"
find "$SHARED" -name '*.test.ts' -delete
python3 - "$SHARED" <<'PY'
import sys
from pathlib import Path
import re

root = Path(sys.argv[1])

# Deno Edge bundler requires explicit .ts extensions on relative imports.
RELATIVE_SPEC = re.compile(
    r"""(?P<prefix>(?:from|import)\s*\(?\s*)(?P<quote>['"])(?P<path>\.\.?/[^'"]+)(?P=quote)"""
)

def ensure_ts_extension(path: str) -> str:
    if path.endswith((".ts", ".tsx", ".js", ".mjs", ".cjs", ".json")):
        return path
    return f"{path}.ts"

def rewrite_relative_imports(text: str) -> str:
    def repl(match: re.Match[str]) -> str:
        path = ensure_ts_extension(match.group("path"))
        return f"{match.group('prefix')}{match.group('quote')}{path}{match.group('quote')}"

    return RELATIVE_SPEC.sub(repl, text)

for path in root.rglob("*.ts"):
    text = path.read_text()
    depth = len(path.relative_to(root).parts) - 1
    ups = "/".join([".."] * depth) if depth else "."
    text2 = text.replace("@fitness-autopilot/contracts", f"{ups}/contracts/index.ts")
    text2 = text2.replace("@fitness-autopilot/validation", f"{ups}/validation/index.ts")
    text2 = text2.replace("@fitness-autopilot/domain", f"{ups}/domain/index.ts")
    text2 = text2.replace("@fitness-autopilot/llm", f"{ups}/llm/index.ts")
    # Node process.env is unavailable in Deno edge; map to Deno.env for config.
    if path.as_posix().endswith("/llm/config.ts"):
        text2 = text2.replace(
            "reader: EnvReader = (key) => process.env[key]",
            "reader: EnvReader = (key) => Deno.env.get(key)",
        )
    text2 = rewrite_relative_imports(text2)
    if text2 != text:
        path.write_text(text2)
print("synced edge _shared domain/contracts/validation/llm copies")
PY
