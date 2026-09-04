/**
 * Regenerates fixtures/demo-draft.json.
 *
 * The fixture is committed, but it is generated rather than hand-written so
 * its `computed` blocks cannot drift from what compute.ts actually produces.
 * Run it with `pnpm fixture` after changing the schema or the compute rules.
 *
 * Everything here is anonymised. The names, the client and the trainer are
 * invented; no real course data is in the repository.
 */

import fs from "node:fs/promises";
import path from "node:path";

import { recomputeDraft } from "@/lib/compute";
import { DraftSchema, SCHEMA_VERSION, summariseZodError, type DraftInput } from "@/lib/schema";

const OUT = path.join(process.cwd(), "fixtures", "demo-draft.json");

const CREATED = "2026-02-08T06:00:00.000Z";
const UPDATED = "2026-02-13T14:20:00.000Z";

type Marks = [number, number, number];

interface Row {
  id: string;
  nameAr: string;
  nameEn: string | null;
  jobTitle: string;
  department: string;
  /** One status per session, in order. */
  attendance: Array<"present" | "late" | "absent" | "excused">;
  marks: Marks;
  outcomeOverride?: "passed" | "failed" | "incomplete";
  outcomeOverrideNote?: string;
}

const sessions = [
  { id: "s1", date: "2026-02-08", startTime: "09:00", endTime: "12:00", durationHours: 3, topicAr: "مقدمة في القيادة الإدارية" },
  { id: "s2", date: "2026-02-09", startTime: "09:00", endTime: "12:00", durationHours: 3, topicAr: "أنماط القيادة واتخاذ القرار" },
  { id: "s3", date: "2026-02-10", startTime: "09:00", endTime: "13:00", durationHours: 4, topicAr: "إدارة فرق العمل والتحفيز" },
  { id: "s4", date: "2026-02-11", startTime: "09:00", endTime: "12:00", durationHours: 3, topicAr: "إدارة الأداء والتغذية الراجعة" },
  { id: "s5", date: "2026-02-12", startTime: "09:00", endTime: "12:00", durationHours: 3, topicAr: "التخطيط الاستراتيجي وعرض المشاريع" },
];

const gradeColumns = [
  { id: "g1", labelAr: "الاختبار القبلي", labelEn: "Pre-assessment", maxScore: 20, weight: 20 },
  { id: "g2", labelAr: "التمارين التطبيقية", labelEn: "Applied exercises", maxScore: 30, weight: 30 },
  { id: "g3", labelAr: "المشروع الختامي", labelEn: "Final project", maxScore: 50, weight: 50 },
];

const rows: Row[] = [
  {
    id: "p1",
    nameAr: "عبدالله بن ناصر القحطاني",
    nameEn: null,
    jobTitle: "مدير عمليات",
    department: "العمليات",
    attendance: ["present", "present", "present", "present", "present"],
    marks: [18, 27, 46],
  },
  {
    id: "p2",
    nameAr: "نورة عبدالعزيز الدوسري",
    nameEn: null,
    jobTitle: "أخصائي موارد بشرية أول",
    department: "الموارد البشرية",
    attendance: ["present", "late", "present", "present", "present"],
    marks: [16, 25, 42],
  },
  {
    // Latin-script name on an otherwise Arabic roster. Present deliberately:
    // it is the row that catches bidi reversal when an RTL table renders a
    // left-to-right run, and M4 depends on it.
    id: "p3",
    nameAr: "Maria Santos",
    nameEn: "Maria Santos",
    jobTitle: "Quality Assurance Lead",
    department: "الجودة",
    attendance: ["present", "present", "late", "present", "present"],
    marks: [17, 28, 44],
  },
  {
    // Late at every session: attends fully, and the attendance rate says so.
    id: "p4",
    nameAr: "فهد سعد العتيبي",
    nameEn: null,
    jobTitle: "مشرف إنتاج",
    department: "الإنتاج",
    attendance: ["late", "late", "late", "late", "late"],
    marks: [14, 22, 38],
  },
  {
    id: "p5",
    nameAr: "هند محمد الشمري",
    nameEn: null,
    jobTitle: "محلل مالي",
    department: "المالية",
    attendance: ["present", "present", "excused", "present", "present"],
    marks: [19, 29, 47],
  },
  {
    // Falls below the attendance threshold despite adequate marks.
    id: "p6",
    nameAr: "خالد إبراهيم الزهراني",
    nameEn: null,
    jobTitle: "مهندس صيانة",
    department: "الصيانة",
    attendance: ["present", "absent", "absent", "present", "absent"],
    marks: [15, 24, 40],
  },
  {
    // Attends well, but the marks do not reach the threshold.
    id: "p7",
    nameAr: "ريم فيصل المطيري",
    nameEn: null,
    jobTitle: "منسق مشاريع",
    department: "إدارة المشاريع",
    attendance: ["present", "present", "present", "late", "present"],
    marks: [9, 14, 22],
  },
  {
    // Overridden: missed the final project for a documented reason and was
    // assessed separately. The computed outcome stays visible underneath.
    id: "p8",
    nameAr: "ماجد عبدالرحمن الحربي",
    nameEn: null,
    jobTitle: "رئيس قسم المشتريات",
    department: "المشتريات",
    attendance: ["present", "present", "present", "absent", "absent"],
    marks: [16, 26, 20],
    outcomeOverride: "passed",
    outcomeOverrideNote:
      "تعذّر حضور الجلستين الأخيرتين لظرف عمل موثّق، وأكمل المشارك تقييماً بديلاً بإشراف المدرب.",
  },
];

const surveyQuestions = [
  { id: "q1", textAr: "وضوح أهداف البرنامج التدريبي", textEn: "Clarity of programme objectives", tally: [0, 0, 1, 3, 4] },
  { id: "q2", textAr: "جودة المادة العلمية المقدمة", textEn: "Quality of the material", tally: [0, 0, 2, 4, 2] },
  { id: "q3", textAr: "كفاءة المدرب وأسلوب العرض", textEn: "Trainer competence and delivery", tally: [0, 0, 0, 2, 6] },
  { id: "q4", textAr: "ملاءمة مدة البرنامج للمحتوى", textEn: "Suitability of the programme duration", tally: [0, 1, 3, 3, 1] },
  { id: "q5", textAr: "مستوى التفاعل والأنشطة العملية", textEn: "Interaction and practical activities", tally: [0, 0, 1, 4, 3] },
  { id: "q6", textAr: "إمكانية تطبيق المهارات في بيئة العمل", textEn: "Applicability of the skills at work", tally: [0, 0, 2, 3, 3] },
];

const narrative = {
  executiveSummary:
    "نُفِّذ برنامج «مهارات القيادة الإدارية الحديثة» خلال الفترة من 8 إلى 12 فبراير 2026 بمقر العميل، بمشاركة ثمانية من شاغلي الوظائف الإشرافية والقيادية. بلغ إجمالي الساعات التدريبية 16 ساعة موزعة على خمس جلسات، وحقق البرنامج معدل حضور إجمالياً مرتفعاً ومستوى رضا عاماً تجاوز التوقعات المحددة في خطة التنفيذ.",
  objectives:
    "استهدف البرنامج تمكين المشاركين من تحديد نمطهم القيادي وتطويره، وبناء قدرتهم على اتخاذ القرار في ظروف الغموض، وإكسابهم أدوات عملية لإدارة الأداء وتقديم التغذية الراجعة البنّاءة، إضافة إلى ربط الممارسات القيادية اليومية بالتوجه الاستراتيجي للمنشأة.",
  methodology:
    "اعتمد التنفيذ على مزيج من العرض النظري الموجز وورش العمل التطبيقية ودراسات الحالة المستمدة من بيئة عمل العميل. خُصص ما لا يقل عن نصف الزمن التدريبي للأنشطة التفاعلية، وأُجري تقييم قبلي في الجلسة الأولى لقياس خط الأساس، وتقييم ختامي عبر مشروع جماعي عُرض في الجلسة الخامسة.",
  contentSummary:
    "غطّت الجلسات خمسة محاور متتابعة: مقدمة في القيادة الإدارية، وأنماط القيادة واتخاذ القرار، وإدارة فرق العمل والتحفيز، وإدارة الأداء والتغذية الراجعة، وأخيراً التخطيط الاستراتيجي وعرض المشاريع الختامية. رُبط كل محور بتمرين تطبيقي مستقل يُقيَّم ضمن درجة التمارين التطبيقية.",
  participantFeedback:
    "أظهرت نتائج استبانة التقييم رضاً مرتفعاً عن كفاءة المدرب وأسلوب العرض، وهو المحور الأعلى تقييماً في الاستبانة. وسجّل محور ملاءمة مدة البرنامج للمحتوى أدنى المتوسطات، حيث أشار عدد من المشاركين إلى الحاجة إلى وقت إضافي لمحور إدارة الأداء تحديداً.",
  trainerObservations:
    "لوحظ تفاعل ملموس من المشاركين في الأنشطة الجماعية، وتحسّن واضح في صياغة أهداف الأداء بين الجلسة الثانية والجلسة الرابعة. واجه بعض المشاركين صعوبة في التمييز بين التغذية الراجعة التقويمية والتطويرية في بداية البرنامج، وقد عولج ذلك عبر تمرين إضافي غير مجدول في الجلسة الرابعة.",
  recommendations:
    "يُوصى بزيادة الزمن المخصص لمحور إدارة الأداء بمقدار ساعتين في الدورات القادمة، وبإضافة جلسة متابعة بعد ستة أسابيع لقياس أثر التدريب في بيئة العمل الفعلية. كما يُوصى بتزويد المشاركين بدليل مرجعي مختصر لنماذج التغذية الراجعة قبل انطلاق البرنامج.",
  conclusion:
    "حقق البرنامج أهدافه المعتمدة في أمر التدريب رقم 20260208114500 الصادر عن إدارة التطوير، واجتاز ستة من أصل ثمانية مشاركين متطلبات النجاح المقررة. تُرفع نتائج التقييم التفصيلية ضمن ملحقات هذا التقرير لاتخاذ ما يلزم بشأن خطط التطوير الفردية.",
};

function build(): DraftInput {
  return {
    schemaVersion: SCHEMA_VERSION,
    id: "demo-0000-4000-8000-demodraft0001",
    createdAt: CREATED,
    updatedAt: UPDATED,
    course: {
      titleAr: "مهارات القيادة الإدارية الحديثة",
      titleEn: "Modern Managerial Leadership Skills",
      code: "LDR-204",
      clientNameAr: "شركة الأفق للصناعات",
      clientNameEn: "Al-Ufuq Industries",
      trainerNameAr: "د. سامي الحارثي",
      trainerNameEn: "Dr. Sami Al-Harthi",
      venue: "قاعة التدريب الرئيسية — مقر العميل",
      deliveryMode: "in-person",
      startDate: "2026-02-08",
      endDate: "2026-02-12",
      passing: { minScore: 60, minAttendanceRate: 75 },
    },
    sessions: sessions.map((session, i) => ({ ...session, index: i + 1, topicEn: null })),
    gradeColumns,
    participants: rows.map((row) => ({
      id: row.id,
      nameAr: row.nameAr,
      nameEn: row.nameEn,
      jobTitle: row.jobTitle,
      department: row.department,
      attendance: Object.fromEntries(sessions.map((s, i) => [s.id, row.attendance[i]])),
      grades: Object.fromEntries(gradeColumns.map((c, i) => [c.id, row.marks[i]])),
      outcomeOverride: row.outcomeOverride ?? null,
      outcomeOverrideNote: row.outcomeOverrideNote ?? null,
    })),
    survey: {
      scaleMax: 5,
      questions: surveyQuestions.map((q) => ({ ...q, textEn: q.textEn })),
    },
    narrative,
    provenance: {
      attendanceSource: "manual",
      profileId: null,
      confidence: null,
      sourceFilename: null,
      extractedAt: null,
      humanConfirmed: true,
    },
  };
}

// Wrapped rather than run at the top level: tsx compiles a .ts file in this
// package as CommonJS, which has no top-level await.
async function main(): Promise<void> {
  const parsed = DraftSchema.safeParse(build());
  if (!parsed.success) {
    console.error("Fixture does not satisfy DraftSchema:");
    console.error(summariseZodError(parsed.error, 20));
    process.exitCode = 1;
    return;
  }

  const draft = recomputeDraft(parsed.data);

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, `${JSON.stringify(draft, null, 2)}\n`, "utf8");

  console.log(`Wrote ${path.relative(process.cwd(), OUT)}`);
  console.log(
    `  ${draft.participants.length} participants, ${draft.sessions.length} sessions, ` +
      `${draft.gradeColumns.length} grade columns, ${draft.survey.questions.length} survey questions`,
  );
  console.log(
    `  totalHours=${draft.computed.totalHours} passed=${draft.computed.passedCount} ` +
      `failed=${draft.computed.failedCount} incomplete=${draft.computed.incompleteCount} ` +
      `avgAttendance=${draft.computed.averageAttendanceRate} ` +
      `surveyAvg=${draft.survey.computed.overallAverage}`,
  );
}

void main();
