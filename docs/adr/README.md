# Architecture decisions

[MADR](https://adr.github.io/madr/) format. Every record lists the options
that were considered and why the rejected ones lost — a record with one
option is a note, not a decision. Each also states the cost of the option
that won, because every real decision has one.

Write a new one with `/adr <the decision>`.

| # | Decision | Why it matters |
|---|---|---|
| [0006](0006-model-writes-the-extraction-profile-not-the-data.md) | The model writes the extraction profile, never the data | The architectural choice the whole PDF pipeline rests on |
| [0007](0007-http-hook-for-draft-validation.md) | Validate the draft with an HTTP hook, not a command hook | Why two hooks in one project use opposite handler types |
| [0008](0008-computed-values-live-in-the-draft.md) | Computed values are stored in the draft | Why the screen and the Word file cannot disagree |
| [0009](0009-one-json-draft-file-written-atomically.md) | One JSON draft file, written atomically | Why an interrupted autosave cannot lose a report |
| [0010](0010-verify-rtl-in-the-produced-bytes.md) | Verify RTL in the produced bytes, with negative controls | Why RTL correctness is asserted rather than reviewed |
| [0011](0011-privacy-boundary.md) | The privacy boundary: what may leave the machine | What is sent, what is not, and how that is enforced |

## The gap at 0001–0005

Those numbers are unused. The project's source PRD was not available while it
was built, and its §13 seed list — which specified the first five records —
could not be read. Rather than invent five decisions and risk contradicting
the real list, the numbers are left free.

The records above document decisions actually made and actually defended
during the work. If the seed list turns up, 0001–0005 slot in underneath
without renumbering anything.

The same gap is why `AGENTS.md` carries only the Next.js block: its content
was specified as PRD Appendix A, verbatim.
