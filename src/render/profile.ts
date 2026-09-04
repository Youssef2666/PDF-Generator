/**
 * The output profile: everything about a rendered document that belongs to
 * the client rather than to the report.
 *
 * A draft says what happened on a course. A profile says how that should
 * look on the page — which fonts, which colours, which language the column
 * headings are in. The two are separate arguments to every renderer so the
 * same draft can be produced under different branding, and so a branding
 * change never touches report data.
 *
 * The font fields carry more weight than they appear to. Word and Excel
 * resolve Arabic text through the *complex script* font slot, not the Latin
 * one, and a document that sets only the Latin font silently falls back to
 * whatever the reader's machine picks for Arabic — which is how identical
 * files come to look different on two computers. Both slots are therefore
 * always set explicitly. See docs/rtl.md.
 */

import { z } from "zod";

export const RenderProfileSchema = z.object({
  /** Identifies the profile in report-data.json and in the output folder. */
  id: z.string().min(1).default("default"),
  name: z.string().min(1).default("Default profile"),

  fonts: z
    .object({
      /**
       * Font used for Arabic runs. This is the complex-script slot; it must
       * be a font that actually ships Arabic glyphs on the machines that
       * will open the file.
       */
      arabic: z.string().min(1).default("Arial"),
      /** Font used for Latin runs and for numbers. */
      latin: z.string().min(1).default("Arial"),
      /** Base point size for body text. */
      size: z.number().positive().default(11),
      /** Point size for table headers. */
      headerSize: z.number().positive().default(11),
    })
    .prefault({ arabic: "Arial", latin: "Arial", size: 11, headerSize: 11 }),

  colors: z
    .object({
      /** Table header fill, as a six-digit hex string with no leading hash. */
      headerFill: z.string().regex(/^[0-9A-Fa-f]{6}$/).default("1F3864"),
      headerText: z.string().regex(/^[0-9A-Fa-f]{6}$/).default("FFFFFF"),
      /** Row shading for banded tables. */
      bandFill: z.string().regex(/^[0-9A-Fa-f]{6}$/).default("F2F5FA"),
      pass: z.string().regex(/^[0-9A-Fa-f]{6}$/).default("1E7A46"),
      fail: z.string().regex(/^[0-9A-Fa-f]{6}$/).default("B42318"),
    })
    .prefault({
      headerFill: "1F3864",
      headerText: "FFFFFF",
      bandFill: "F2F5FA",
      pass: "1E7A46",
      fail: "B42318",
    }),

  /**
   * Language of the generated labels — sheet names, column headings, the
   * words "passed" and "absent". Report content is always whatever the
   * draft holds; this only controls the furniture the renderer supplies.
   */
  labelLanguage: z.enum(["ar", "en"]).default("ar"),
});

export type RenderProfile = z.infer<typeof RenderProfileSchema>;

export const DEFAULT_PROFILE: RenderProfile = RenderProfileSchema.parse({});

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const LABELS = {
  ar: {
    sheetParticipants: "المشاركون",
    sheetAttendance: "سجل الحضور",
    sheetGrades: "الدرجات",
    sheetSurvey: "الاستبانة",
    sheetCourseInfo: "بيانات الدورة",

    name: "الاسم",
    nameLatin: "الاسم (لاتيني)",
    jobTitle: "المسمى الوظيفي",
    department: "الإدارة",
    attendanceRate: "نسبة الحضور",
    attendedHours: "ساعات الحضور",
    totalScore: "الدرجة النهائية",
    outcome: "النتيجة",
    computedOutcome: "النتيجة المحتسبة",
    overrideNote: "سبب التعديل",

    session: "جلسة",
    date: "التاريخ",
    startTime: "من",
    endTime: "إلى",
    hours: "الساعات",
    topic: "الموضوع",
    present: "حاضر",
    late: "متأخر",
    absent: "غائب",
    excused: "بعذر",
    notRecorded: "غير مسجل",
    lateCount: "مرات التأخر",

    question: "السؤال",
    responses: "عدد الردود",
    average: "المتوسط",
    noResponses: "لا توجد ردود",
    rating: "تقدير",

    field: "البند",
    value: "القيمة",
    courseTitle: "اسم الدورة",
    client: "الجهة",
    trainer: "المدرب",
    code: "رمز الدورة",
    venue: "المكان",
    deliveryMode: "أسلوب التنفيذ",
    startDate: "تاريخ البداية",
    endDate: "تاريخ النهاية",
    totalHours: "إجمالي الساعات",
    sessionCount: "عدد الجلسات",
    participantCount: "عدد المشاركين",
    passedCount: "عدد الناجحين",
    failedCount: "عدد الراسبين",
    incompleteCount: "غير مكتمل",
    averageAttendance: "متوسط الحضور",
    averageScore: "متوسط الدرجات",
    surveyAverage: "متوسط الاستبانة",
    minScore: "الحد الأدنى للدرجة",
    minAttendance: "الحد الأدنى للحضور",
    passed: "ناجح",
    failed: "راسب",
    incomplete: "غير مكتمل",
    inPerson: "حضوري",
    online: "عن بعد",
    blended: "مدمج",
    generatedAt: "تاريخ إصدار التقرير",
  },
  en: {
    sheetParticipants: "Participants",
    sheetAttendance: "Attendance",
    sheetGrades: "Grades",
    sheetSurvey: "Survey",
    sheetCourseInfo: "Course Info",

    name: "Name",
    nameLatin: "Name (Latin)",
    jobTitle: "Job title",
    department: "Department",
    attendanceRate: "Attendance %",
    attendedHours: "Hours attended",
    totalScore: "Total score",
    outcome: "Outcome",
    computedOutcome: "Computed outcome",
    overrideNote: "Override reason",

    session: "Session",
    date: "Date",
    startTime: "Start",
    endTime: "End",
    hours: "Hours",
    topic: "Topic",
    present: "Present",
    late: "Late",
    absent: "Absent",
    excused: "Excused",
    notRecorded: "Not recorded",
    lateCount: "Late count",

    question: "Question",
    responses: "Responses",
    average: "Average",
    noResponses: "No responses",
    rating: "Rating",

    field: "Field",
    value: "Value",
    courseTitle: "Course title",
    client: "Client",
    trainer: "Trainer",
    code: "Course code",
    venue: "Venue",
    deliveryMode: "Delivery mode",
    startDate: "Start date",
    endDate: "End date",
    totalHours: "Total hours",
    sessionCount: "Sessions",
    participantCount: "Participants",
    passedCount: "Passed",
    failedCount: "Failed",
    incompleteCount: "Incomplete",
    averageAttendance: "Average attendance",
    averageScore: "Average score",
    surveyAverage: "Survey average",
    minScore: "Minimum score",
    minAttendance: "Minimum attendance",
    passed: "Passed",
    failed: "Failed",
    incomplete: "Incomplete",
    inPerson: "In person",
    online: "Online",
    blended: "Blended",
    generatedAt: "Generated",
  },
} as const;

export type LabelKey = keyof (typeof LABELS)["en"];

/** Label lookup for a profile. */
export function labels(profile: RenderProfile): Record<LabelKey, string> {
  return LABELS[profile.labelLanguage];
}

/** True when the generated furniture reads right-to-left. */
export function isRtl(profile: RenderProfile): boolean {
  return profile.labelLanguage === "ar";
}
