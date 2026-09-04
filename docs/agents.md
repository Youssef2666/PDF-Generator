# Agent architecture

What is wired into Claude Code in this repository, why each piece exists, and
where its boundary is.

The organising idea: **the agent surface enforces invariants that code alone
cannot.** `draft-store.ts` validates its own writes, but it is not the only
writer — an agent can edit the draft file directly. `docs/rtl.md` records the
RTL rules, but a document only proves them once it is opened. Each hook below
closes a gap of that shape.

---

## Hooks

Four, and they deliberately use three different handler types. The type is
chosen per hook from what it must survive.

### 1. `PostToolUse` → HTTP → `/api/hooks/validate-draft`

**Matcher:** `Write|Edit`

Validates `data/drafts/current.json` after any edit, and feeds the Zod error
back into the session as a `reason`.

**Why HTTP.** The route imports the same `DraftSchema` the application uses,
so the check cannot drift from the thing it checks — no second copy of the
rules, no build step, no separate dependency tree. And it costs no process
start-up on the overwhelming majority of edits, which touch files that are
not the draft.

**Boundary.** It only ever looks at the draft; any other `file_path` gets an
empty 200. It reads the file by its own resolved path rather than the one in
the request, so it is not a "read any file the caller names" primitive. It
fails open on an internal error — a broken validator must not wedge a
session.

**The cost, stated plainly.** When the dev server is down the hook does not
validate: Claude Code records a non-blocking error and the edit stands. The
`SessionStart` hook reports whether localhost:3000 is up so a session begins
knowing whether this check is live. Full reasoning in
[ADR 0007](adr/0007-http-hook-for-draft-validation.md).

Two contract details worth keeping in mind if you touch it: an HTTP hook
**cannot block with a status code** — a non-2xx is discarded as a
non-blocking error, so every path returns 200, failures included. And
`PostToolUse` has **no `permissionDecision`**; that belongs to `PreToolUse`.
The blocking shape is `{"decision":"block","reason":"…"}`.

### 2. `PreToolUse` → command → `protect-uploads.mjs`

**Matcher:** `Write|Edit|NotebookEdit|MultiEdit|Bash`

Refuses any write into `data/uploads/`. Uploaded registers are the one thing
here that cannot be regenerated.

**Why command, when hook 1 is HTTP.** This one must hold whether or not a
server is running. A rule that protects irreplaceable files cannot be
contingent on `pnpm dev`. The two hooks use opposite handler types for
opposite reasons, and that asymmetry is the point rather than an
inconsistency.

**Why Node rather than shell.** It parses the event JSON, and `jq` is not
guaranteed on a Windows machine.

**Boundary.** Reading from `data/uploads/` stays allowed; only writes and
deletions are refused. For `Bash` it matches write verbs and redirections
rather than any mention of the path, so `ls data/uploads` passes. It fails
*closed* across every candidate project root — an earlier version compared
one base and fell open whenever `CLAUDE_PROJECT_DIR` and the event's `cwd`
disagreed on path form, which they do on Windows (`D:/x` vs `/d/x`).

Exit 2 blocks and the stderr text is what the session is told. Every other
path exits 0 deliberately, including malformed input: the guard must not
crash its way into a pass.

### 3. `Stop` → agent → `report-auditor`

Runs a read-only audit when a session ends.

**Why an agent rather than a command.** The checks are judgement calls —
"does this computed value match its inputs", "does this profile look like it
contains a name" — not assertions a script can make. `Stop` takes no
matcher; it always fires.

**Boundary.** Read-only tools, enforced by the agent's own frontmatter
(`Read, Grep, Glob`). It reports; it never edits. A finding that gets
silently repaired is a finding nobody learns from.

The hook's `prompt` points the subagent at `.claude/agents/report-auditor.md`
rather than restating the audit inline, so there is one copy of what to
check. Note that the `agent` handler type takes `prompt` and `model` only —
there is no field for naming a subagent file, which is why it is loaded by
Read. Agent hooks are experimental.

### 4. `SessionStart` → command → `session-context.sh`

**Matcher:** `startup|resume|clear|compact`

Reports two facts: whether a draft exists, and whether localhost:3000
responds.

**Boundary, and it is deliberate.** It states facts and issues no
instructions. What to do about a missing dev server is the session's
decision. Phrasing it as guidance would make a shell script the author of the
session's plan.

It matters more than it looks: hook 1 is inert without the server, so
"localhost:3000 is not responding" is also "draft validation is off right
now".

---

## Skills

### `office-rtl`

The full catalogue of Word, Excel and PowerPoint RTL rules, each with the
symptom it fixes and why the obvious alternative fails.

**Boundary.** It knows nothing about this project — no draft, no schema, no
course reports. It is written to be lifted into its own repository, and the
rules are stated in terms of the file formats. `docs/rtl.md` is the
project-facing view of the same rules; when one changes, both change.

The layer model and the `themeFontLang` master switch are adapted from
[muhmoosa/claude-arabic-docs](https://github.com/muhmoosa/claude-arabic-docs).

### `pdf-attendance`

The extraction workflow: writing a profile for a new client layout, reading
the failure modes, and the rules governing the model fallback.

**Boundary.** It is the operational guide; `docs/adr/0011` is the decision
and its reasoning. The skill tells you how to add a client; the ADR tells you
why you may not simply send the PDF to a model.

---

## Subagents

### `report-auditor` — read-only, haiku

Audits the draft against the project's invariants: orphaned attendance keys,
computed values that disagree with their inputs, names or dates leaking into
a profile, anything under `data/` becoming tracked.

**Boundary.** Read, Grep, Glob. No writes, no commands, and an explicit list
of what to check — an auditor that ranges freely produces long reports about
nothing, which trains people to stop reading them.

### `rtl-reviewer` — sonnet

Reviews renderer changes against the RTL catalogue. Starts by running
`pnpm verify:rtl`, because the premise of the whole area is that RTL bugs are
invisible from the code.

**Boundary.** It reviews `src/render/*` and the verifier. It does not edit
renderers, and it is expected to say plainly when a question can only be
answered by opening the file in Word — which nobody here can do.

---

## Commands

### `/adr <decision>`

Writes an ADR in MADR form, numbered from what already exists.

The command exists to enforce one thing: **the rejected options are the
point.** A record listing a single option is a note, not a decision. It also
requires the chosen option's cost to be stated — an ADR where the winner had
no downside is not describing a real decision.

### `/fixture`

Regenerates the committed fixtures and runs everything that depends on them.

Exists because the fixtures are generated, never hand-edited, and the failure
mode is quiet: change a compute rule, forget to regenerate, and the renderers
are then built against numbers `compute.ts` no longer produces.
`fixture.test.ts` is the tripwire; this command is how you clear it.

---

## What is deliberately not automated

**No hook writes to the draft.** Validation blocks and reports; it never
repairs. A hook that silently fixed a bad write would hide the bug that
produced it.

**No agent runs a renderer or an export.** Producing a client deliverable is
a human action, gated on the F7 checklist.

**No hook calls a model on document content.** The only model call in the
project is the extraction-profile proposal, which is off by default, requires
explicit consent, and never receives participant data — see
[ADR 0011](adr/0011-privacy-boundary.md).
