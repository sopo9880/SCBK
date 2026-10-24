#!/usr/bin/env bash
# Fail fast on GDScript parse/runtime errors and prevent cancelled 15-minute
# Actions jobs caused by a SceneTree test that cannot call quit() after a crash.
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: bash tools/check_godot.sh EXPECTED_STDOUT|- GODOT_ARGS..." >&2
  exit 2
fi
expected="$1"
shift
log_file="$(mktemp)"
trap 'rm -f "$log_file"' EXIT

if timeout --signal=TERM --kill-after=3s 90s godot --headless --path . "$@" >"$log_file" 2>&1; then
  cat "$log_file"
else
  code=$?
  cat "$log_file"
  echo "::error::Godot command exited with status $code (or timed out after 90s)." >&2
  exit "$code"
fi

if grep -Eq 'SCRIPT ERROR:|Parse Error:|Compile Error:|Failed to load script|Invalid call\.|SCBK .*test failed' "$log_file"; then
  echo "::error::Godot logged a compile or runtime error; failing instead of hanging in the test." >&2
  exit 1
fi

if [[ "$expected" != "-" ]] && ! grep -Fq "$expected" "$log_file"; then
  echo "::error::Test did not print its required success marker: $expected" >&2
  exit 1
fi
