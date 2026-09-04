---
status: accepted
date: 2026-09-04
deciders: project owner
---

# 0009 — One JSON draft file, written atomically

## Context and Problem Statement

While a report is being built it has to live somewhere. It is a single
document — one course, its participants, marks, survey and prose — edited by
one person at a time, on their own machine, over an afternoon.

The editor autosaves on a 500ms debounce, so there is nearly always a write
in flight. Whatever holds the draft will be interrupted mid-write, repeatedly:
a closed tab, a restarted dev server, a laptop lid.

## Decision Drivers

* Losing a half-finished report is the worst outcome the tool can produce.
* One user, one draft at a time. No concurrency to speak of.
* The draft is the thing agents and hooks inspect, so it should be readable
  without a client.
* Nothing here should require a service to be installed before the tool runs.

## Considered Options

1. **SQLite**, with the draft as rows.
2. **One JSON file** at `data/drafts/current.json`, written atomically.
3. **Browser storage** — IndexedDB or localStorage — with no server state.
4. **A directory of JSON files**, one per section.

## Decision Outcome

**Option 2.** `data/drafts/current.json`, and `draft-store.ts` is the only
code that touches it. Every write validates against the Zod schema, runs
`recomputeDraft`, serialises, writes `current.json.<pid>.<uuid>.tmp`, fsyncs,
and renames over the target. Rename within a directory is atomic, so an
interrupted write leaves the previous draft intact rather than a truncated
file.

Writes are serialised through an in-process promise chain, so two autosaves
cannot interleave.

### Consequences

* An interrupted save costs the last edit, never the report.
* The draft is a plain file: readable in an editor, diffable, greppable,
  inspectable by an agent with no tooling at all. The `PostToolUse`
  validation hook exists *because* it is an ordinary file that an agent can
  edit directly — a database would have made that impossible, which sounds
  like a benefit until you notice it also removes the ability to fix a draft
  by hand when something goes wrong.
* No service to install. `pnpm install && pnpm dev` is the whole setup.
* The costs, stated plainly: **one draft at a time**, and **the whole file is
  rewritten on every keystroke-debounce**. Neither matters at this size — the
  demo draft is 16 KB — but both would matter at a hundred concurrent users,
  and this decision would be the first to revisit.
* A temp file needs a unique name. Two processes sharing one would truncate
  each other's file before the rename.

## Pros and Cons of the Options

### 1. SQLite

* Good, because transactions and durability come for free, and concurrent
  writers would be handled properly.
* Good, because it scales past one draft without a redesign.
* Bad, because the draft stops being inspectable without a client, and the
  hook that validates agent edits to it has nothing to hook.
* Bad, because it adds a native dependency and a migration story to a tool
  whose entire state is one document.
* Rejected on weight, not correctness. If this ever becomes multi-user, this
  is the option to come back to.

### 2. One JSON file, atomic rename (chosen)

* Good, because it is exactly as durable as the problem needs, and the
  durability mechanism is two lines you can read.
* Good, because everything else in the project — hooks, agents, tests,
  fixtures — can treat the draft as data.
* Bad, because it rewrites the whole document on every save.
* Bad, because it offers no concurrency story at all beyond "don't".

### 3. Browser storage only

* Good, because there is no server-side state to manage.
* Bad, because the report would be trapped in one browser profile, invisible
  to the renderers, and gone when someone clears their site data.
* Bad, because the renderers run in Node — the draft has to reach the server
  anyway.
* Rejected.

### 4. A directory of files, one per section

* Good, because a save would touch only the section that changed.
* Bad, because the draft stops being one thing: a reader has to assemble it,
  and "the draft is valid" becomes a cross-file property that no single parse
  can check.
* Bad, because atomicity gets harder rather than easier — a rename per file
  gives no consistent point across the set.
* Rejected: it trades a real invariant for an optimisation nothing needs.

## More Information

Implementation: `src/lib/draft-store.ts`. The validation hook that depends on
the draft being an ordinary file:
[0007](0007-http-hook-for-draft-validation.md).
