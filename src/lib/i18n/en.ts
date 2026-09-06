/**
 * English UI strings. This is the reference dictionary: `Dictionary` is
 * its type, so a key added here without an Arabic counterpart fails to
 * compile rather than silently rendering English on an Arabic screen.
 *
 * Strings that carry a count are functions, because Arabic pluralises
 * differently from English and an interpolated template cannot express
 * that. Checklist labels and details are keyed by the ids and codes that
 * compute.ts emits; English leaves them empty and falls back to the text
 * compute.ts already produced, so this file and the export route's error
 * messages cannot drift apart.
 */

import type { ChecklistParams } from "@/lib/compute";

const narrativeSections = {
  executiveSummary: "Executive summary",
  objectives: "Objectives",
  methodology: "Methodology",
  contentSummary: "Content summary",
  participantFeedback: "Participant feedback",
  trainerObservations: "Trainer observations",
  recommendations: "Recommendations",
  conclusion: "Conclusion",
};

const courseFields = {
  titleAr: "Arabic course title",
  clientNameAr: "Arabic client name",
  trainerNameAr: "Arabic trainer name",
};

export const en = {
  appName: "Course Report Studio",
  untitledReport: "Untitled report",

  language: {
    label: "Language",
    names: { en: "English", ar: "العربية" },
  },

  nav: {
    course: {
      label: "Course setup",
      description: "Who ran it, for whom, when — and the session schedule.",
    },
    attendance: {
      label: "Import attendance",
      description: "Read the client's register, review it beside the page, confirm.",
    },
    participants: {
      label: "Participants",
      description: "The roster and the attendance matrix.",
    },
    grades: {
      label: "Grades",
      description: "Columns, weights, marks, and the outcomes they produce.",
    },
    survey: {
      label: "Survey",
      description: "Questions and the response tally for each rating.",
    },
    narrative: {
      label: "Narrative",
      description: "The report's prose, in Arabic.",
    },
    review: {
      label: "Review & finalize",
      description: "The readiness checklist, the computed figures, and export.",
    },
  },

  save: {
    saving: "Saving",
    pending: "Unsaved changes",
    error: "Save failed",
    saved: "Saved",
    savedAt: (time: string) => `Saved ${time}`,
    idle: "No changes",
  },

  shell: {
    loading: "Loading draft…",
    finalized: "Report finalized",
    writtenTo: "Written to",
    noReport: "No report in progress",
    noReportBody:
      "Start a new report to begin entering course details, participants, grades, survey results and narrative.",
    start: "Start a new report",
    readyToFinalize: "Ready to finalize",
    readiness: "Readiness",
    everyRequiredPasses: "Every required item passes.",
    outstanding: (n: number) => `${n} required item${n === 1 ? "" : "s"} outstanding.`,
    outstandingBadge: (n: number) => `${n} required item(s) outstanding`,
  },

  common: {
    remove: "Remove",
    cancel: "Cancel",
    discard: "Discard",
    none: "—",
    empty: "empty",
    unchanged: "unchanged",
  },

  attendanceStatus: {
    present: "Present",
    late: "Late",
    absent: "Absent",
    excused: "Excused",
  },

  outcome: {
    passed: "passed",
    failed: "failed",
    incomplete: "incomplete",
  },

  course: {
    card: "Course",
    titleAr: "Course title (Arabic)",
    titleEn: "Course title (English)",
    clientAr: "Client (Arabic)",
    clientEn: "Client (English)",
    trainerAr: "Trainer (Arabic)",
    trainerEn: "Trainer (English)",
    code: "Course code",
    venue: "Venue",
    venueHint: "Mixed content — direction follows what you type.",
    deliveryMode: "Delivery mode",
    delivery: { "in-person": "In person", online: "Online", blended: "Blended" },
    startDate: "Start date",
    endDate: "End date",
    passingRule: "Passing rule",
    minScore: "Minimum score",
    minScoreHint: "Weighted total out of 100. Inclusive.",
    minAttendance: "Minimum attendance %",
    minAttendanceHint: "Both thresholds must be met to pass.",
    generate: "Generate sessions",
    generateBody: "Creates one session per day across the course date range.",
    generateWarning: "This replaces the current session list.",
    dailyStart: "Daily start",
    dailyEnd: "Daily end",
    skipWeekends: "Skip Fri/Sat",
    generateButton: (n: number) => (n > 0 ? `Generate ${n} sessions` : "Generate sessions"),
    setDatesFirst: "Set the course start and end dates first.",
    sessions: "Sessions",
    sessionsSummary: (sessions: number, hours: number) => `${sessions} sessions · ${hours} hours`,
    columns: {
      index: "#",
      date: "Date",
      start: "Start",
      end: "End",
      hours: "Hours",
      topic: "Topic (Arabic)",
    },
    noSessions: "No sessions yet.",
    removeSession: (index: number) => `Remove session ${index}`,
    addSession: "Add session",
  },

  participants: {
    card: "Participants",
    people: (n: number) => `${n} people`,
    columns: {
      nameAr: "Name (Arabic)",
      nameEn: "Name (Latin)",
      jobTitle: "Job title",
      department: "Department",
    },
    noParticipants: "No participants yet.",
    removeParticipant: (name: string) => `Remove ${name}`,
    addParticipant: "Add participant",
    attendance: "Attendance",
    addBefore: (missing: "sessions" | "participants") =>
      `Add ${missing} before recording attendance.`,
    participant: "Participant",
    sessionShort: (index: number) => `S${index}`,
    fillRow: "Fill row",
    rate: "Rate",
    hours: "Hours",
    late: (n: number) => `${n} late`,
    cellLabel: (name: string, index: number) => `${name}, session ${index}`,
    allPresent: "All present",
  },

  grades: {
    columnsCard: "Grade columns",
    weightsTotal: (n: number) => `weights total ${n}`,
    columns: {
      labelAr: "Label (Arabic)",
      labelEn: "Label (English)",
      maxScore: "Max score",
      weight: "Weight",
    },
    noColumns: "No grade columns yet.",
    removeColumn: (label: string) => `Remove ${label}`,
    addColumn: "Add column",
    pasteCard: "Paste marks from a spreadsheet",
    pasteBody:
      "One row per participant in the order shown below, one tab-separated column per grade column. Blank cells clear a mark.",
    pasteParsed: (rows: number, participants: number) =>
      `${rows} row(s) parsed against ${participants} participant(s)`,
    pasteMismatch: " — counts differ, extra rows are ignored and missing rows are left unchanged.",
    participant: "Participant",
    overMax: (value: number, max: number) => `${value} (over max ${max})`,
    apply: (n: number) => `Apply to ${n} row(s)`,
    marksCard: "Marks and outcomes",
    addFirst: (missing: "columns" | "participants") =>
      `Add ${missing === "columns" ? "grade columns" : "participants"} first.`,
    columnMeta: (max: number, weight: number) => `/${max} · ${weight}%`,
    total: "Total",
    attendance: "Attendance",
    outcome: "Outcome",
    override: "Override",
    overrideNote: "Override note",
    markLabel: (name: string, column: string) => `${name}, ${column}`,
    wasOutcome: (outcome: string) => `was ${outcome}`,
    wasOutcomeTitle: "The rules produced this before the override",
    overrideFor: (name: string) => `Override outcome for ${name}`,
    overrideReasonFor: (name: string) => `Override reason for ${name}`,
    noOverride: "No override",
    overrideOptions: { passed: "Passed", failed: "Failed", incomplete: "Incomplete" },
  },

  survey: {
    card: "Survey",
    noResponses: "no responses yet",
    overall: (average: number, max: number, n: number) => `overall ${average} / ${max} · n=${n}`,
    scale: "Rating scale",
    scaleHint:
      "Number of points on the Likert scale. Lowering it drops the ratings above the new maximum.",
    questionsCard: "Questions and response tallies",
    columns: {
      questionAr: "Question (Arabic)",
      questionEn: "Question (English)",
      n: "n",
      average: "Average",
    },
    noQuestions: "No questions yet.",
    tallyLabel: (question: string, rating: number) => `${question}, rating ${rating}`,
    noResponsesCell: "no responses",
    noResponsesTitle: "No responses. This renders as 'no data', not as zero.",
    removeQuestion: (question: string) => `Remove question ${question}`,
    addQuestion: "Add question",
  },

  narrative: {
    progress: (written: number, total: number) =>
      `${written} of ${total} sections written. All fields are right-to-left Arabic.`,
    characters: (n: number) => `${n} characters`,
    sections: narrativeSections,
    hints: {
      executiveSummary:
        "What was run, for whom, and how it went — the paragraph a manager reads alone.",
      objectives: "What the programme set out to change.",
      methodology: "How it was delivered and how participants were assessed.",
      contentSummary: "The topics covered, session by session.",
      participantFeedback:
        "What the survey said, in prose. The figures come from the survey screen.",
      trainerObservations: "What the trainer noticed that the numbers do not show.",
      recommendations: "What should change before this runs again.",
      conclusion: "Closing statement and formal sign-off.",
    },
  },

  review: {
    readiness: "Readiness",
    allPass: "All required items pass",
    outstanding: (n: number) => `${n} required item(s) outstanding`,
    fix: "Fix",
    reviewLink: "Review",
    advisory: "Advisory — reported, does not block finalize",
    figures: "Computed figures",
    figuresBody:
      "Every figure below is produced by compute.ts and stored in the draft. The exported documents render these same values.",
    figure: {
      participants: "Participants",
      sessions: "Sessions",
      totalHours: "Total hours",
      gradeWeight: "Grade weight",
      passed: "Passed",
      failed: "Failed",
      incomplete: "Incomplete",
      avgAttendance: "Avg attendance",
      avgScore: "Avg score",
      surveyAverage: "Survey average",
      surveyResponses: "Survey responses",
    },
    outcomesCard: "Outcomes by participant",
    noParticipants: "No participants yet.",
    participant: "Participant",
    attendance: "Attendance",
    score: "Score",
    outcome: "Outcome",
    overriddenFrom: (outcome: string) => `overridden from ${outcome}`,
    finalize: "Finalize",
    finalizeBody: {
      before: "Renders the Word report, Excel workbook and PowerPoint deck into ",
      after: ", writes report-data.json alongside them, and then clears the draft.",
    },
    rendering: "Rendering…",
    checklistIncomplete: "Checklist incomplete",
    waitingForSave: "Waiting for save…",
    finalizeReport: "Finalize report",
    sectionFailed: (section: string) => `${section} failed.`,
    exportFailed: "Export failed.",
    exportFailedHttp: (status: number) => `Export failed (HTTP ${status})`,
    nothingWritten: "Nothing was written and your draft is untouched.",
    finalized: "Report finalized",
    writtenTo: "Written to",
    draftCleared: "The draft has been cleared. Start a new report from any screen.",
  },

  attendanceImport: {
    card: "Import an attendance register",
    body: "Upload the client's PDF. A committed profile is applied locally if one fits; nothing is sent anywhere. You will review the parsed table against the page before it enters the draft.",
    byHand: "Enter by hand instead",
    working: "Working…",
    provenance: "Current draft provenance:",
    confirmed: "confirmed by a human",
    notConfirmed: "not yet confirmed",
    matched: (profile: string, percent: number) =>
      `Matched "${profile}" with ${percent}% of cells read. Check it against the page before confirming.`,
    noMatch: (tried: number) =>
      `No committed profile matched this document (${tried} tried). Enter the table by hand below, or propose a profile if that is enabled.`,
    proposed:
      "A profile was proposed and run locally. The table below came from that profile, not from the model — check every row.",
    blank: "Blank table. Add rows and sessions, then confirm.",
    written: (participants: number, sessions: number) =>
      `${participants} participants and ${sessions} sessions written into the draft. Times default to 09:00-12:00 — adjust them on Course setup.`,
    uploadFailed: (status: number) => `Upload failed (${status})`,
    proposalFailed: "Proposal failed",
    proposeCard: "Ask a model to describe this layout",
    proposeBody: {
      before:
        "This is the only step that sends anything off this machine, and it is off by default. The model is asked to describe ",
      emphasis: "where the columns are",
      after: ". It never sees the roster and never returns one — the table is produced locally afterwards.",
    },
    payloadHeading: (cells: number) =>
      `Exactly what would be sent — ${cells} cells already replaced with placeholders:`,
    nothingToSend: "(nothing to send — no table-like rows found)",
    disabled: { before: "Disabled. Set ", after: " to allow it." },
    noCredentials: "Enabled, but no API credentials are configured.",
    consent: "I have read the payload above and agree to send it to Anthropic's API.",
    propose: "Propose a profile",
    parsedTable: "Parsed table",
    manualEntry: "manual entry",
    profileRead: (profile: string, percent: number) => `${profile} · ${percent}% read`,
    thingsToCheck: (n: number) => `${n} thing(s) to check:`,
    name: "Name",
    department: "Department",
    sessionDate: (index: number) => `Session ${index} date`,
    nameRow: (row: number) => `Name, row ${row}`,
    departmentRow: (row: number) => `Department, row ${row}`,
    cell: (row: number, session: number) => `Row ${row}, session ${session}`,
    addRow: "Add row",
    addSession: "Add session",
    confirm: "Confirm and write into the draft",
    confirmNote: "This replaces the draft's participants and sessions.",
    sourcePage: "Source page",
    uploadedRegister: "Uploaded attendance register",
    cannotDisplay: "Your browser cannot display the PDF inline.",
    openInTab: "Open it in a new tab",
    noDocument: "No document — this table is being entered by hand.",
  },

  checklist: {
    courseFields,
    narrativeSections,
    /** Keyed by checklist item id. A missing key falls back to compute.ts's label. */
    labels: {} as Partial<Record<string, string>>,
    /** Keyed by detail code. A missing key falls back to compute.ts's detail. */
    details: {} as Partial<Record<string, (p: ChecklistParams) => string>>,
  },
};

export type Dictionary = typeof en;
