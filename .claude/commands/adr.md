---
description: Record an architecture decision, with the options that were rejected
argument-hint: "<the decision, in a few words>"
allowed-tools: Read, Write, Glob, Bash(git log:*)
---

Write an ADR for: **$ARGUMENTS**

Existing records, for the next number and the house style:

!`ls docs/adr/ 2>/dev/null | sort | tail -6`

Use MADR, matching the existing files: YAML front matter with `status`,
`date` and `deciders`, then Context and Problem Statement, Decision Drivers,
Considered Options, Decision Outcome (with Consequences), and Pros and Cons
of the Options.

Filename: `docs/adr/NNNN-kebab-case-title.md`, next free number, today's date.

Two rules that matter more than the format:

**The rejected options are the point.** An ADR listing one option is a note,
not a decision record. Give every option genuinely considered its own Pros
and Cons entry, and say plainly why the rejected ones lost. If an option was
rejected on cost rather than correctness, say so — that is the one most
likely to be revisited.

**State the cost of the option that won.** Every real decision has one. An
ADR that reads as though the chosen option had no downside is not describing
a decision that was actually made.

Write only what was really decided. If you do not know why something was
chosen, ask rather than inventing a rationale — a plausible-sounding
invented reason is worse than a gap, because nobody will question it later.
