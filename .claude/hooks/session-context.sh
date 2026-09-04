#!/usr/bin/env bash
#
# SessionStart hook — Course Report Studio
#
# Reports two observable facts about the workspace so a starting session does
# not have to probe for them:
#   1. whether an in-progress draft exists at data/drafts/current.json
#   2. whether the dev server on localhost:3000 is responding
#
# Output contract: exactly one JSON object on stdout, shaped as
#   {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"..."}}
#
# This hook states facts. It does not issue instructions, make requests, or
# suggest next steps — deciding what to do about the state below is the
# session's job, not this script's.

set -uo pipefail

project_dir="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
draft_path="$project_dir/data/drafts/current.json"

# Escape a value for embedding inside a JSON string literal: backslashes
# first, then quotes, then any control characters flattened to spaces.
json_escape() {
  local s="$1"
  s="${s//\/\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\t'/ }"
  s="${s//$'\r'/}"
  s="${s//$'\n'/ }"
  printf '%s' "$s"
}

# --- Fact 1: the draft file ------------------------------------------------
if [ -f "$draft_path" ]; then
  bytes=$(wc -c < "$draft_path" 2>/dev/null | tr -d '[:space:]')
  modified=$(date -r "$draft_path" '+%Y-%m-%d %H:%M' 2>/dev/null) || modified=""
  if [ -n "$modified" ]; then
    draft_fact="An in-progress draft exists at data/drafts/current.json (${bytes:-unknown} bytes, last modified ${modified})."
  else
    draft_fact="An in-progress draft exists at data/drafts/current.json (${bytes:-unknown} bytes)."
  fi
else
  draft_fact="No draft file exists at data/drafts/current.json."
fi

# --- Fact 2: the dev server ------------------------------------------------
# curl's exit status is the signal. It prints an http_code of 000 alongside a
# non-zero exit when the connection fails, so the two must not be conflated.
dev_fact="The dev server on localhost:3000 is not responding."
if command -v curl >/dev/null 2>&1; then
  if http_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://localhost:3000/ 2>/dev/null); then
    dev_fact="The dev server on localhost:3000 is responding (HTTP ${http_code})."
  fi
elif (exec 3<>/dev/tcp/127.0.0.1/3000) 2>/dev/null; then
  exec 3>&-
  dev_fact="A process is listening on localhost:3000."
fi

# --- Emit ------------------------------------------------------------------
# nl holds the two literal characters \ and n, and reaches the output through
# a %s conversion. It must never travel in a printf *format* string: bash's
# printf collapses a format-level \n into a real newline, which is a control
# character and illegal inside a JSON string literal.
nl='\n'
body="$(json_escape "$draft_fact")${nl}$(json_escape "$dev_fact")"

printf '%s\n' "{\"hookSpecificOutput\":{\"hookEventName\":\"SessionStart\",\"additionalContext\":\"${body}\"}}"
