---
description: Regenerate the committed fixtures and verify they still hold
allowed-tools: Bash(pnpm:*), Read, Edit
---

Regenerate the fixtures and check nothing drifted.

Current state:

!`pnpm fixture 2>&1 | tail -4`

The PDF register (regenerate only if `scripts/make-attendance-fixture.ts` or
the font changed — the committed PDF is otherwise stable):

!`ls -la fixtures/*.pdf fixtures/*.json 2>/dev/null`

Now run the checks that depend on them:

!`pnpm test 2>&1 | tail -6`

!`pnpm verify:rtl 2>&1 | tail -6`

What to do with the results:

- `fixture.test.ts` failing on "already recomputed" means `compute.ts`
  changed and `fixtures/demo-draft.json` is stale. Regenerating fixes it —
  but check the new numbers are what you intended before committing them.
- `pdf.test.ts` failing means the register or its profile drifted apart.
- `verify:rtl` failing names the rule and the sheet, table or slide.

The demo draft is generated, never hand-edited: it carries `Maria Santos`
and a long digit string on purpose, and both must survive any regeneration.
If you changed the `Draft` type, `docs/data-model.md` moves in the same
commit as the schema, `compute.ts` and the fixture.
