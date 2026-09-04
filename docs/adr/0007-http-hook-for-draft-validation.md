---
status: accepted
date: 2026-09-04
deciders: project owner
---

# 0007 — Validate the draft with an HTTP hook, not a command hook

## Context and Problem Statement

`data/drafts/current.json` is the working state of a report. The API route
validates everything it writes, but the API route is not the only writer: an
agent working in this repository can edit the draft file directly with Write
or Edit, and that path bypasses `draft-store.ts` entirely.

When that happens we want the agent told immediately, in terms it can act on
— "`participants.0.attendance.s2`: expected one of present|late|absent|
excused" — rather than discovering the corruption at export time, several
steps later, as a stack trace from a renderer.

Claude Code's `PostToolUse` hook fires after every Edit and Write, and can
return a decision that is fed back into the session. The question is which
**handler type** validates the file.

## Decision Drivers

* The validation must use *the same* Zod schema as the rest of the app. A
  second copy of the rules that drifts is worse than no check at all.
* The feedback has to reach the agent as a readable reason.
* The hook runs after every single Edit and Write in the repository, so its
  cost on the overwhelming majority of calls — which have nothing to do with
  the draft — must be near zero.

## Considered Options

1. **`type: "http"`** — POST the event to a route on the running dev server.
2. **`type: "command"`** — run a Node script that loads the schema and
   validates the file.
3. **No hook.** Rely on `draft-store.ts` guarding its own writes.
4. **A command hook that calls the HTTP endpoint** (e.g. a curl wrapper).

## Decision Outcome

**Option 1.** `.claude/settings.json` registers a `PostToolUse` hook matching
`Write|Edit` that POSTs to
`http://localhost:3000/api/hooks/validate-draft`. The route reads
`tool_input.file_path`, and if — and only if — it resolves to the draft, it
parses the file with `DraftSchema` and returns either an empty 200 or
`{"decision":"block","reason":"..."}`.

Two details of the hook contract shape this route, and both are easy to get
wrong:

* **An HTTP hook cannot block with a status code.** A non-2xx response is
  treated as a *non-blocking error* and the decision is discarded. Every
  path in the route therefore returns **200**, including the failure paths.
* **`PostToolUse` has no `permissionDecision`** — that field belongs to
  `PreToolUse`, which runs before the tool. The blocking shape here is
  `{"decision":"block","reason":"..."}`.

### Consequences

* The schema has exactly one definition. The route imports `DraftSchema`
  from `src/lib/schema.ts`, the same module the API and the store use, so
  the hook cannot drift from the app.
* No process start-up per Edit. The hook is an HTTP request to a server that
  is already running, and edits to unrelated files return an empty 200 after
  a path comparison.
* **The cost, stated plainly: when the dev server is down, the hook does not
  validate.** Claude Code reports the failed request as a non-blocking error
  and the edit stands. This is a real gap, accepted because (a) the workflow
  already assumes `pnpm dev` is running, (b) `draft-store.ts` still validates
  every write that goes through the app, so the gap only covers direct file
  edits made while the server is stopped, and (c) the `SessionStart` hook
  reports whether localhost:3000 is responding, so a session starts knowing
  whether this check is live.
* The route fails open on an internal error. A broken validator must not
  wedge the session, and a non-2xx would be discarded anyway.

## Pros and Cons of the Options

### 1. HTTP hook (chosen)

* Good, because it reuses the running app's schema — one source of truth, no
  build step, no second dependency tree.
* Good, because it is fast on the common case: no Node process is spawned per
  Edit.
* Good, because the validation logic is ordinary application code that can be
  tested and read like the rest of the app.
* Bad, because it is silently inert when the dev server is not running.
* Bad, because it couples an editor-side safety net to a dev server, which is
  a slightly surprising dependency to a newcomer.

### 2. Command hook running a Node script

* Good, because it works with no server: the check is live whenever the
  repository is open.
* Bad, because it pays a Node start-up on *every* Edit and Write in the
  repository, the vast majority of which are not the draft. That is the
  common case, and making the common case slow to serve the rare one is the
  wrong trade.
* Bad, because the script must load the Zod schema from TypeScript source,
  which means either a build step or a TS loader in the hook path — more
  moving parts between the rule and its enforcement.
* Rejected on cost and complexity, not correctness. If the server dependency
  becomes painful in practice, this is the option to revisit.

### 3. No hook

* Good, because it is no machinery at all.
* Bad, because it leaves the exact hole the hook exists to close: the store
  cannot police writes that do not go through the store. Direct edits to
  `current.json` would corrupt state silently until an export failed.

### 4. Command hook that shells out to the HTTP endpoint

* Good, because it could fall back to local validation when the server is
  down, closing the gap in option 1.
* Bad, because it combines both costs: a process start-up per Edit *and* a
  dependency on the server, plus a second code path that is exercised only
  when the server happens to be down — the path least likely to be correct
  when it finally runs.
* Rejected as strictly worse than either option it combines.

## More Information

`PreToolUse` protection of `data/uploads/` uses a **command** hook instead,
precisely because it must hold whether or not a server is running — see
`.claude/hooks/protect-uploads.mjs`. The two hooks in this project use
different handler types for opposite reasons, and `docs/agents.md` explains
the choice per hook.
