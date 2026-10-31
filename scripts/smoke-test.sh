#!/usr/bin/env bash
# Checks a running server end to end: health, then a real run on an example file, then the output files.
# Usage: scripts/smoke-test.sh [base-url]      (default http://127.0.0.1:8787)
set -euo pipefail
BASE="${1:-http://127.0.0.1:8787}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
SAMPLE="$HERE/public/samples/sample.csv"
[ -f "$SAMPLE" ] || SAMPLE="$HERE/dist/samples/sample.csv"   # copies that only carry the built page

say() { printf '%s\n' "$*"; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

health="$(curl -fsS "$BASE/api/health")" || fail "no answer from $BASE/api/health"
say "health: $health"
case "$health" in *'"kind":"real"'*) ;; *) fail "the server is not using the real program (see the engine line in its start-up log)";; esac

# the options object (the same fields the web page sends)
OPTIONS='{"level":2,"seed":42,"idStyle":"sequential","columns":{},"scaleMin":1,"scaleMax":20,"dateShiftMode":"random","dateShiftMin":1,"dateShiftMax":100,"dateShiftFixed":23.6,"renameMode":"off","renamePrefix":"COL","writeKeymap":true,"dropFreetext":false,"protect":["TIME","TAD","DV","LNDV","AMT","RATE","EVID","MDV","CMT","ADDL","II","SS","DVID","CENS","LIMIT","BLQ","L2","OCC","PC","PCYC"],"adamHints":true,"delimiter":"auto","noHeader":false,"commentChars":"#;$","verbose":false,"outputName":""}'
resp="$(curl -fsS --form-string "options=$OPTIONS" -F "file=@$SAMPLE" "$BASE/api/jobs")" || fail "the server refused the run"
id="$(printf '%s' "$resp" | sed -E 's/.*"id":"([^"]+)".*/\1/')"
say "job: $id"

events="$(curl -fsSN --max-time 60 "$BASE/api/jobs/$id/events")" || true
printf '%s' "$events" | grep -q '"type":"done"' || fail "the run did not finish: $(printf '%s' "$events" | grep '"type":"fail"' | head -1)"
say "run finished"

for f in obfuscated.csv llm.txt tokens.txt keymap.txt summary.txt column_report.txt config.used.txt obfuscator.log; do
  curl -fsS "$BASE/api/jobs/$id/files/$f" -o /dev/null || fail "missing output file $f"
  say "  ok  $f"
done
curl -fsS -X DELETE "$BASE/api/jobs/$id" >/dev/null

# several datasets: the server runs run2 and writes one masked file per dataset
ADAM="$HERE/public/samples/adam"
if [ -d "$ADAM" ]; then
  say "several datasets (run2):"
  resp="$(curl -fsS --form-string "options=$OPTIONS" -F "file=@$ADAM/adsl.csv" -F "file=@$ADAM/adex.csv" -F "file=@$ADAM/adpc.csv" "$BASE/api/jobs")" || fail "the server refused the run2 run"
  id="$(printf '%s' "$resp" | sed -E 's/.*"id":"([^"]+)".*/\1/')"
  events="$(curl -fsSN --max-time 60 "$BASE/api/jobs/$id/events")" || true
  printf '%s' "$events" | grep -q '"type":"done"' || fail "the run2 run did not finish: $(printf '%s' "$events" | grep '"type":"fail"' | head -1)"
  for f in adsl_masked.csv adex_masked.csv adpc_masked.csv llm2.txt keymap2.txt summary2.txt config.used.txt run2.log; do
    curl -fsS "$BASE/api/jobs/$id/files/$f" -o /dev/null || fail "missing run2 output file $f"
    say "  ok  $f"
  done
  curl -fsS -X DELETE "$BASE/api/jobs/$id" >/dev/null
fi
say "PASS"
