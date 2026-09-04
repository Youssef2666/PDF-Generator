# Architecture

Two diagrams and the reasoning around them. Everything else is in the code.

## Data flow

One draft file is the working state. Every screen edits it, every renderer
reads it, and one function computes every derived number in it.

```mermaid
flowchart TD
    PDF[Client attendance PDF] -->|pdfjs| EX[extract-text.ts<br/>positioned text]
    EX --> DET[deterministic.ts<br/>+ extraction profile]
    PROF[(committed profile<br/>layout only)] --> DET
    DET --> REV{Review screen<br/>human confirms}
    MAN[Manual entry] --> REV

    REV --> DRAFT[(data/drafts/current.json<br/>the one working state)]
    UI[Course · Participants · Grades<br/>Survey · Narrative] <-->|autosave 500ms| API[/api/draft/]
    API --> STORE[draft-store.ts<br/>validate → recompute → atomic write]
    STORE --> DRAFT

    DRAFT --> COMPUTE[compute.ts<br/>every derived value]
    COMPUTE --> DRAFT

    DRAFT --> GATE{F7 checklist<br/>computeChecklist}
    GATE -->|ready| EXPORT[/api/export/]
    EXPORT --> DOCX[docx.ts]
    EXPORT --> XLSX[xlsx.ts]
    EXPORT --> PPTX[pptx.ts]
    DOCX & XLSX & PPTX --> PKG[(output/date-client-course/<br/>3 documents + report-data.json)]
    PKG -->|only now| DEL[draft deleted]

    style DRAFT fill:#1F3864,color:#fff
    style COMPUTE fill:#1E7A46,color:#fff
    style PROF fill:#F2F5FA
```

Three properties this shape buys:

**Computation has one home.** `compute.ts` produces every attendance rate,
score and outcome, and stores them in the draft. The UI renders what it finds
there; the renderers write what they find there. A figure on screen and the
same figure in the Word file are the same bytes, so they cannot disagree.

**The draft is never half-written.** `draft-store.ts` validates against the
Zod schema, recomputes, writes a temp file and renames it over the target.
The editor autosaves every 500ms, so it *will* be interrupted mid-write; the
rename is what makes that safe.

**Export is all-or-nothing.** All three documents render into memory before
any directory is created, and the draft is deleted only once the package is
on disk. A renderer that throws leaves the draft exactly as it was — it is
the only copy of hours of manual entry.

## The hook loop

`draft-store.ts` guards its own writes, but it is not the only writer: an
agent working in this repository can edit `current.json` directly, and that
path bypasses the store. The `PostToolUse` hook closes it.

```mermaid
sequenceDiagram
    participant A as Agent
    participant CC as Claude Code
    participant R as localhost:3000<br/>/api/hooks/validate-draft
    participant Z as DraftSchema (Zod)

    A->>CC: Write data/drafts/current.json
    CC->>CC: tool runs — file already changed
    CC->>R: POST event JSON (PostToolUse)
    R->>R: is tool_input.file_path the draft?
    alt not the draft
        R-->>CC: 200, empty body
    else the draft
        R->>Z: parse the file on disk
        alt valid
            Z-->>R: ok
            R-->>CC: 200, empty body
        else invalid
            Z-->>R: ZodError
            R-->>CC: 200 {"decision":"block",<br/>"reason":"participants.0.attendance.s2: …"}
            CC->>A: reason fed back into the session
        end
    end
```

Two details of the contract shape this, and both are easy to get wrong.
**An HTTP hook cannot block with a status code** — a non-2xx is treated as a
non-blocking error and the decision is discarded, so every path returns 200,
including the failures. And **`PostToolUse` has no `permissionDecision`**;
that field belongs to `PreToolUse`, which runs before the tool. The blocking
shape here is `{"decision":"block","reason":"…"}`.

The route reads the draft by its own resolved path rather than the one in the
request, so the endpoint is not a "read any file the caller names" primitive.

Why HTTP rather than a command hook: the route imports the same
`DraftSchema` the app uses, so the check cannot drift from the thing it is
checking, and no process starts on the overwhelming majority of edits that
have nothing to do with the draft. The cost, stated plainly, is that the
check is inert when the dev server is down — which is why the `SessionStart`
hook reports whether localhost:3000 is responding. Full reasoning in
[ADR 0007](adr/0007-http-hook-for-draft-validation.md).

`PreToolUse` protection of `data/uploads/` uses a **command** hook instead,
precisely because it must hold whether or not a server is running. The two
hooks use different handler types for opposite reasons; see
[docs/agents.md](agents.md).
