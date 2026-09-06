/**
 * Arabic UI strings. Typed against the English dictionary, so this file
 * cannot be missing a key.
 *
 * Register: Modern Standard Arabic, with the administrative vocabulary a
 * Libyan training company already uses on its paperwork — «كشف الحضور»,
 * «الجهة المستفيدة», «المدرب». Counts are formatted with the Arabic rules
 * for one, two, three-to-ten and eleven-plus, and digits are Western,
 * which is how numbers are written in Libya and in the report documents.
 */

import type { ChecklistParams } from "@/lib/compute";
import type { Dictionary } from "./en";

/**
 * Arabic count agreement. The noun forms are:
 *   one      — the singular, counted implicitly («جلسة واحدة»)
 *   two      — the dual («جلستان»)
 *   few      — 3 to 10, plural noun («3 جلسات»)
 *   many     — 11 and up, singular noun in the accusative («11 جلسة»)
 * Zero takes the plural («لا توجد جلسات»), which callers phrase themselves.
 */
function count(
  n: number,
  forms: { one: string; two: string; few: string; many: string },
): string {
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  if (n >= 3 && n <= 10) return `${n} ${forms.few}`;
  return `${n} ${forms.many}`;
}

const sessions = { one: "جلسة واحدة", two: "جلستان", few: "جلسات", many: "جلسة" };
const participants = { one: "مشارك واحد", two: "مشاركان", few: "مشاركين", many: "مشاركاً" };
const hours = { one: "ساعة واحدة", two: "ساعتان", few: "ساعات", many: "ساعة" };
const items = { one: "بند واحد", two: "بندان", few: "بنود", many: "بنداً" };
const rows = { one: "صف واحد", two: "صفان", few: "صفوف", many: "صفاً" };
const questions = { one: "سؤال واحد", two: "سؤالان", few: "أسئلة", many: "سؤالاً" };
const columns = { one: "عمود واحد", two: "عمودان", few: "أعمدة", many: "عموداً" };
const cells = { one: "خلية واحدة", two: "خليتان", few: "خلايا", many: "خلية" };
const characters = { one: "حرف واحد", two: "حرفان", few: "أحرف", many: "حرفاً" };

const narrativeSections = {
  executiveSummary: "الملخص التنفيذي",
  objectives: "الأهداف",
  methodology: "المنهجية",
  contentSummary: "ملخص المحتوى",
  participantFeedback: "آراء المشاركين",
  trainerObservations: "ملاحظات المدرب",
  recommendations: "التوصيات",
  conclusion: "الخاتمة",
};

const courseFields = {
  titleAr: "عنوان الدورة بالعربية",
  clientNameAr: "اسم الجهة المستفيدة بالعربية",
  trainerNameAr: "اسم المدرب بالعربية",
};

const outcome = {
  passed: "ناجح",
  failed: "راسب",
  incomplete: "غير مكتمل",
};

/** Outcome words as they arrive from compute.ts, rendered in Arabic. */
function outcomeWord(value: string): string {
  return (outcome as Record<string, string>)[value] ?? value;
}

const num = (p: ChecklistParams, key: string) => Number(p[key] ?? 0);
const list = (p: ChecklistParams, key: string) => (Array.isArray(p[key]) ? p[key] : []) as string[];

export const ar: Dictionary = {
  appName: "استوديو تقارير الدورات",
  untitledReport: "تقرير بلا عنوان",

  language: {
    label: "اللغة",
    names: { en: "English", ar: "العربية" },
  },

  nav: {
    course: {
      label: "إعداد الدورة",
      description: "من نفّذها، ولصالح من، ومتى — وجدول الجلسات.",
    },
    attendance: {
      label: "استيراد الحضور",
      description: "اقرأ كشف الجهة المستفيدة، وراجعه بجانب الصفحة، ثم اعتمده.",
    },
    participants: {
      label: "المشاركون",
      description: "قائمة المشاركين ومصفوفة الحضور.",
    },
    grades: {
      label: "الدرجات",
      description: "عناصر التقييم وأوزانها والدرجات والنتائج المترتبة عليها.",
    },
    survey: {
      label: "الاستبانة",
      description: "الأسئلة وعدد الإجابات لكل تقدير.",
    },
    narrative: {
      label: "النص السردي",
      description: "نصوص التقرير بالعربية.",
    },
    review: {
      label: "المراجعة والاعتماد",
      description: "قائمة الجاهزية، والأرقام المحسوبة، والتصدير.",
    },
  },

  save: {
    saving: "جارٍ الحفظ",
    pending: "تغييرات غير محفوظة",
    error: "فشل الحفظ",
    saved: "تم الحفظ",
    savedAt: (time) => `حُفظ ${time}`,
    idle: "لا تغييرات",
  },

  shell: {
    loading: "جارٍ تحميل المسودة…",
    finalized: "تم اعتماد التقرير",
    writtenTo: "كُتب في",
    noReport: "لا يوجد تقرير قيد الإعداد",
    noReportBody:
      "ابدأ تقريراً جديداً لإدخال بيانات الدورة والمشاركين والدرجات ونتائج الاستبانة والنص السردي.",
    start: "بدء تقرير جديد",
    readyToFinalize: "جاهز للاعتماد",
    readiness: "الجاهزية",
    everyRequiredPasses: "كل البنود الإلزامية مستوفاة.",
    outstanding: (n) => `${count(n, items)} من البنود الإلزامية لم تُستوفَ بعد.`,
    outstandingBadge: (n) => `${count(n, items)} من البنود الإلزامية لم تُستوفَ بعد`,
  },

  common: {
    remove: "حذف",
    cancel: "إلغاء",
    discard: "تجاهل",
    none: "—",
    empty: "فارغ",
    unchanged: "دون تغيير",
  },

  attendanceStatus: {
    present: "حاضر",
    late: "متأخر",
    absent: "غائب",
    excused: "بعذر",
  },

  outcome,

  course: {
    card: "الدورة",
    titleAr: "عنوان الدورة (بالعربية)",
    titleEn: "عنوان الدورة (بالإنجليزية)",
    clientAr: "الجهة المستفيدة (بالعربية)",
    clientEn: "الجهة المستفيدة (بالإنجليزية)",
    trainerAr: "المدرب (بالعربية)",
    trainerEn: "المدرب (بالإنجليزية)",
    code: "رمز الدورة",
    venue: "مكان الانعقاد",
    venueHint: "محتوى مختلط — يتبع اتجاه النص ما تكتبه.",
    deliveryMode: "أسلوب التنفيذ",
    delivery: { "in-person": "حضوري", online: "عن بُعد", blended: "مدمج" },
    startDate: "تاريخ البداية",
    endDate: "تاريخ النهاية",
    passingRule: "شرط النجاح",
    minScore: "الحد الأدنى للدرجة",
    minScoreHint: "المجموع الموزون من 100، شاملاً الحد نفسه.",
    minAttendance: "الحد الأدنى لنسبة الحضور %",
    minAttendanceHint: "يجب استيفاء الشرطين معاً للنجاح.",
    generate: "توليد الجلسات",
    generateBody: "ينشئ جلسة واحدة لكل يوم ضمن فترة الدورة.",
    generateWarning: "هذا يستبدل قائمة الجلسات الحالية.",
    dailyStart: "بداية اليوم",
    dailyEnd: "نهاية اليوم",
    skipWeekends: "تخطي الجمعة والسبت",
    generateButton: (n) => (n > 0 ? `توليد ${count(n, sessions)}` : "توليد الجلسات"),
    setDatesFirst: "حدّد تاريخي بداية الدورة ونهايتها أولاً.",
    sessions: "الجلسات",
    sessionsSummary: (s, h) => `${count(s, sessions)} · ${count(h, hours)}`,
    columns: {
      index: "#",
      date: "التاريخ",
      start: "البداية",
      end: "النهاية",
      hours: "الساعات",
      topic: "الموضوع (بالعربية)",
    },
    noSessions: "لا توجد جلسات بعد.",
    removeSession: (index) => `حذف الجلسة ${index}`,
    addSession: "إضافة جلسة",
  },

  participants: {
    card: "المشاركون",
    people: (n) => count(n, participants),
    columns: {
      nameAr: "الاسم (بالعربية)",
      nameEn: "الاسم (بالأحرف اللاتينية)",
      jobTitle: "المسمى الوظيفي",
      department: "الإدارة",
    },
    noParticipants: "لا يوجد مشاركون بعد.",
    removeParticipant: (name) => `حذف ${name}`,
    addParticipant: "إضافة مشارك",
    attendance: "الحضور",
    addBefore: (missing) =>
      missing === "sessions"
        ? "أضف الجلسات قبل تسجيل الحضور."
        : "أضف المشاركين قبل تسجيل الحضور.",
    participant: "المشارك",
    sessionShort: (index) => `ج${index}`,
    fillRow: "تعبئة الصف",
    rate: "النسبة",
    hours: "الساعات",
    late: (n) => `${n} تأخير`,
    cellLabel: (name, index) => `${name}، الجلسة ${index}`,
    allPresent: "الكل حاضر",
  },

  grades: {
    columnsCard: "عناصر التقييم",
    weightsTotal: (n) => `مجموع الأوزان ${n}`,
    columns: {
      labelAr: "العنوان (بالعربية)",
      labelEn: "العنوان (بالإنجليزية)",
      maxScore: "الدرجة القصوى",
      weight: "الوزن",
    },
    noColumns: "لا توجد عناصر تقييم بعد.",
    removeColumn: (label) => `حذف ${label}`,
    addColumn: "إضافة عنصر",
    pasteCard: "لصق الدرجات من جدول بيانات",
    pasteBody:
      "صف لكل مشارك بالترتيب المبين أدناه، وعمود مفصول بعلامة جدولة لكل عنصر تقييم. الخلية الفارغة تمسح الدرجة.",
    pasteParsed: (r, p) => `تمت قراءة ${count(r, rows)} مقابل ${count(p, participants)}`,
    pasteMismatch: " — الأعداد مختلفة؛ تُهمل الصفوف الزائدة وتبقى الصفوف الناقصة دون تغيير.",
    participant: "المشارك",
    overMax: (value, max) => `${value} (يتجاوز الحد ${max})`,
    apply: (n) => `تطبيق على ${count(n, rows)}`,
    marksCard: "الدرجات والنتائج",
    addFirst: (missing) =>
      missing === "columns" ? "أضف عناصر التقييم أولاً." : "أضف المشاركين أولاً.",
    columnMeta: (max, weight) => `/${max} · ${weight}%`,
    total: "المجموع",
    attendance: "الحضور",
    outcome: "النتيجة",
    override: "تعديل يدوي",
    overrideNote: "مسوّغ التعديل",
    markLabel: (name, column) => `${name}، ${column}`,
    wasOutcome: (o) => `كانت ${outcomeWord(o)}`,
    wasOutcomeTitle: "ما أنتجته القواعد قبل التعديل اليدوي",
    overrideFor: (name) => `تعديل نتيجة ${name}`,
    overrideReasonFor: (name) => `مسوّغ تعديل نتيجة ${name}`,
    noOverride: "بلا تعديل",
    overrideOptions: { passed: "ناجح", failed: "راسب", incomplete: "غير مكتمل" },
  },

  survey: {
    card: "الاستبانة",
    noResponses: "لا إجابات بعد",
    overall: (average, max, n) => `المتوسط العام ${average} / ${max} · العدد ${n}`,
    scale: "مقياس التقدير",
    scaleHint: "عدد درجات مقياس ليكرت. خفضه يُسقط التقديرات الأعلى من الحد الجديد.",
    questionsCard: "الأسئلة وعدد الإجابات",
    columns: {
      questionAr: "السؤال (بالعربية)",
      questionEn: "السؤال (بالإنجليزية)",
      n: "العدد",
      average: "المتوسط",
    },
    noQuestions: "لا توجد أسئلة بعد.",
    tallyLabel: (question, rating) => `${question}، التقدير ${rating}`,
    noResponsesCell: "لا إجابات",
    noResponsesTitle: "لا إجابات. يظهر هذا في التقرير كـ«لا بيانات» لا كصفر.",
    removeQuestion: (question) => `حذف السؤال ${question}`,
    addQuestion: "إضافة سؤال",
  },

  narrative: {
    progress: (written, total) =>
      `كُتب ${written} من ${total} أقسام. كل الحقول عربية من اليمين إلى اليسار.`,
    characters: (n) => count(n, characters),
    sections: narrativeSections,
    hints: {
      executiveSummary: "ما نُفّذ، ولصالح من، وكيف سار — الفقرة التي يقرأها المدير وحدها.",
      objectives: "ما سعى البرنامج إلى تغييره.",
      methodology: "كيف نُفّذ البرنامج وكيف قُيّم المشاركون.",
      contentSummary: "الموضوعات التي غُطّيت، جلسةً جلسة.",
      participantFeedback: "ما قالته الاستبانة، نثراً. الأرقام تأتي من شاشة الاستبانة.",
      trainerObservations: "ما لاحظه المدرب ولا تُظهره الأرقام.",
      recommendations: "ما ينبغي تغييره قبل التنفيذ القادم.",
      conclusion: "الخلاصة والاعتماد الرسمي.",
    },
  },

  review: {
    readiness: "الجاهزية",
    allPass: "كل البنود الإلزامية مستوفاة",
    outstanding: (n) => `${count(n, items)} من البنود الإلزامية لم تُستوفَ بعد`,
    fix: "إصلاح",
    reviewLink: "مراجعة",
    advisory: "إرشادي — يُبلَّغ عنه ولا يمنع الاعتماد",
    figures: "الأرقام المحسوبة",
    figuresBody:
      "كل رقم أدناه يُنتجه compute.ts ويُخزَّن في المسودة. المستندات المصدَّرة تعرض القيم نفسها.",
    figure: {
      participants: "المشاركون",
      sessions: "الجلسات",
      totalHours: "إجمالي الساعات",
      gradeWeight: "مجموع الأوزان",
      passed: "ناجحون",
      failed: "راسبون",
      incomplete: "غير مكتمل",
      avgAttendance: "متوسط الحضور",
      avgScore: "متوسط الدرجات",
      surveyAverage: "متوسط الاستبانة",
      surveyResponses: "إجابات الاستبانة",
    },
    outcomesCard: "النتائج حسب المشارك",
    noParticipants: "لا يوجد مشاركون بعد.",
    participant: "المشارك",
    attendance: "الحضور",
    score: "الدرجة",
    outcome: "النتيجة",
    overriddenFrom: (o) => `عُدّلت يدوياً من ${outcomeWord(o)}`,
    finalize: "الاعتماد",
    finalizeBody: {
      before: "يُنتج تقرير Word ومصنف Excel وعرض PowerPoint في ",
      after: "، ويكتب بجانبها report-data.json، ثم يمسح المسودة.",
    },
    rendering: "جارٍ الإنتاج…",
    checklistIncomplete: "قائمة الجاهزية غير مكتملة",
    waitingForSave: "بانتظار الحفظ…",
    finalizeReport: "اعتماد التقرير",
    sectionFailed: (section) => `فشل ${section}.`,
    exportFailed: "فشل التصدير.",
    exportFailedHttp: (status) => `فشل التصدير (HTTP ${status})`,
    nothingWritten: "لم يُكتب شيء، ومسودتك كما هي.",
    finalized: "تم اعتماد التقرير",
    writtenTo: "كُتب في",
    draftCleared: "مُسحت المسودة. يمكنك بدء تقرير جديد من أي شاشة.",
  },

  attendanceImport: {
    card: "استيراد كشف الحضور",
    body: "ارفع ملف PDF الخاص بالجهة المستفيدة. يُطبَّق ملف تعريف معتمد محلياً إن وُجد ما يناسبه، ولا يُرسل شيء إلى أي مكان. ستراجع الجدول المستخرج مقابل الصفحة قبل دخوله إلى المسودة.",
    byHand: "الإدخال يدوياً بدلاً من ذلك",
    working: "جارٍ العمل…",
    provenance: "مصدر بيانات المسودة الحالية:",
    confirmed: "اعتمده شخص",
    notConfirmed: "لم يُعتمد بعد",
    matched: (profile, percent) =>
      `طابق «${profile}» وقُرئت ${percent}% من الخلايا. راجعه مقابل الصفحة قبل الاعتماد.`,
    noMatch: (tried) =>
      `لم يطابق أي ملف تعريف معتمد هذا المستند (جُرّب ${tried}). أدخل الجدول يدوياً أدناه، أو اطلب اقتراح ملف تعريف إن كان ذلك مفعّلاً.`,
    proposed:
      "اقتُرح ملف تعريف وشُغّل محلياً. الجدول أدناه جاء من ذلك الملف لا من النموذج — راجع كل صف.",
    blank: "جدول فارغ. أضف الصفوف والجلسات ثم اعتمد.",
    written: (p, s) =>
      `كُتب ${count(p, participants)} و${count(s, sessions)} في المسودة. الأوقات الافتراضية 09:00-12:00 — عدّلها في إعداد الدورة.`,
    uploadFailed: (status) => `فشل الرفع (${status})`,
    proposalFailed: "فشل الاقتراح",
    proposeCard: "اطلب من نموذج وصف هذا التخطيط",
    proposeBody: {
      before:
        "هذه الخطوة الوحيدة التي ترسل شيئاً خارج هذا الجهاز، وهي معطّلة افتراضياً. يُطلب من النموذج وصف ",
      emphasis: "مواضع الأعمدة",
      after: ". لا يرى قائمة الأسماء أبداً ولا يعيدها — الجدول يُنتج محلياً بعد ذلك.",
    },
    payloadHeading: (n) =>
      `ما سيُرسل بالضبط — ${count(n, cells)} استُبدلت بعناصر نائبة مسبقاً:`,
    nothingToSend: "(لا شيء لإرساله — لم يُعثر على صفوف تشبه الجدول)",
    disabled: { before: "معطّل. اضبط ", after: " للسماح به." },
    noCredentials: "مفعّل، لكن لا توجد بيانات اعتماد للواجهة البرمجية.",
    consent: "قرأت البيانات أعلاه وأوافق على إرسالها إلى واجهة Anthropic البرمجية.",
    propose: "اقتراح ملف تعريف",
    parsedTable: "الجدول المستخرج",
    manualEntry: "إدخال يدوي",
    profileRead: (profile, percent) => `${profile} · قُرئ ${percent}%`,
    thingsToCheck: (n) => `${count(n, items)} للمراجعة:`,
    name: "الاسم",
    department: "الإدارة",
    sessionDate: (index) => `تاريخ الجلسة ${index}`,
    nameRow: (row) => `الاسم، الصف ${row}`,
    departmentRow: (row) => `الإدارة، الصف ${row}`,
    cell: (row, session) => `الصف ${row}، الجلسة ${session}`,
    addRow: "إضافة صف",
    addSession: "إضافة جلسة",
    confirm: "اعتماد وكتابة في المسودة",
    confirmNote: "هذا يستبدل المشاركين والجلسات في المسودة.",
    sourcePage: "الصفحة المصدر",
    uploadedRegister: "كشف الحضور المرفوع",
    cannotDisplay: "لا يستطيع متصفحك عرض ملف PDF داخل الصفحة.",
    openInTab: "افتحه في تبويب جديد",
    noDocument: "لا يوجد مستند — يُدخل هذا الجدول يدوياً.",
  },

  checklist: {
    courseFields,
    narrativeSections,
    labels: {
      "course-identity": "الدورة والجهة المستفيدة والمدرب مسمّاة بالعربية",
      "course-dates": "تاريخا البداية والنهاية محددان ومرتّبان",
      "sessions-exist": "جلسة واحدة على الأقل",
      "sessions-have-hours": "لكل جلسة ساعات معتمدة",
      "participants-exist": "مشارك واحد على الأقل",
      "participants-roles": "لكل مشارك مسمى وظيفي وإدارة",
      "attendance-complete": "الحضور مسجّل لكل مشارك وكل جلسة",
      "grades-exist": "عنصر تقييم واحد على الأقل",
      "grades-weights": "مجموع أوزان التقييم 100",
      "grades-complete": "درجات كل مشارك مكتملة",
      "outcomes-decided": "لا يوجد مشارك بنتيجة غير مكتملة",
      "survey-exists": "سؤال استبانة واحد على الأقل",
      "survey-answered": "لكل سؤال في الاستبانة إجابات",
      "narrative-complete": "كل أقسام النص السردي مكتوبة",
    },
    details: {
      "course-identity.ok": () => "الحقول الثلاثة معبّأة.",
      "course-identity.missing": (p) =>
        `ناقص: ${list(p, "fields")
          .map((key) => (courseFields as Record<string, string>)[key] ?? key)
          .join("، ")}.`,
      "course-dates.missing": () => "تاريخ البداية وتاريخ النهاية مطلوبان معاً.",
      // Each date is isolated (LRI … PDI) so the one at the end of the line
      // is not mirrored by the surrounding right-to-left run.
      "course-dates.ok": (p) => `من ⁦${p.start}⁩ إلى ⁦${p.end}⁩.`,
      "course-dates.reversed": () => "تاريخ النهاية يسبق تاريخ البداية.",
      "sessions-exist.ok": (p) =>
        `${count(num(p, "count"), sessions)}، بإجمالي ${count(num(p, "hours"), hours)}.`,
      "sessions-exist.none": () => "أضف الجلسات، أو ولّدها دفعة واحدة من فترة الدورة.",
      "sessions-have-hours.none": () => "لا توجد جلسات بعد.",
      "sessions-have-hours.ok": () => "لكل جلسة مدة محددة.",
      "sessions-have-hours.zero": (p) => `${count(num(p, "count"), sessions)} بلا ساعات.`,
      "participants-exist.ok": (p) => `${count(num(p, "count"), participants)}.`,
      "participants-exist.none": () => "أضف المشاركين يدوياً، أو استورد كشف حضور PDF.",
      "participants-roles.ok": () => "لكل المشاركين مسمى وإدارة.",
      "participants-roles.missing": (p) =>
        `${count(num(p, "count"), participants)} بلا مسمى وظيفي أو إدارة.`,
      "attendance-complete.nothing": () => "لا شيء لتسجيله بعد.",
      "attendance-complete.ok": (p) => `سُجّلت كل الخلايا (${p.total}).`,
      "attendance-complete.blank": (p) => `${p.blank} من ${p.total} خلية ما زالت فارغة.`,
      "grades-exist.ok": (p) => `${count(num(p, "count"), columns)}.`,
      "grades-exist.none": () => "أضف عناصر التقييم التي تُقيَّم بها هذه الدورة.",
      "grades-weights.none": () => "لا توجد عناصر لوزنها.",
      "grades-weights.ok": () => "مجموع الأوزان 100.",
      "grades-weights.off": (p) => `مجموع الأوزان ${p.total} وليس 100.`,
      "grades-complete.none": () => "لا يوجد مشاركون بعد.",
      "grades-complete.ok": () => "لكل المشاركين مجموع درجات.",
      "grades-complete.unmarked": (p) =>
        `${count(num(p, "count"), participants)} لديهم عنصر بلا درجة.`,
      "outcomes-decided.none": () => "لا يوجد مشاركون بعد.",
      "outcomes-decided.ok": (p) => `${p.passed} ناجح، ${p.failed} راسب.`,
      "outcomes-decided.incomplete": (p) =>
        `${count(num(p, "count"), participants)} ما زالت نتيجتهم غير مكتملة.`,
      "survey-exists.ok": (p) => `${count(num(p, "count"), questions)}.`,
      "survey-exists.none": () => "أضف الأسئلة التي طُرحت على هذه الدفعة.",
      "survey-answered.none": () => "لا توجد أسئلة بعد.",
      "survey-answered.ok": (p) => `المتوسط العام ${p.average}.`,
      "survey-answered.unanswered": (p) =>
        `${count(num(p, "count"), questions)} بلا إجابات وستظهر كـ«لا بيانات».`,
      "narrative-complete.ok": () => "الأقسام الثمانية كلها معبّأة.",
      "narrative-complete.empty": (p) =>
        `فارغ: ${list(p, "sections")
          .map((key) => (narrativeSections as Record<string, string>)[key] ?? key)
          .join("، ")}.`,
    },
  },
};

