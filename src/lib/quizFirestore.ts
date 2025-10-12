// src/lib/quizFirestore.ts
import { db, auth } from "@/lib/firebase";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import type { Quiz, QuizQuestion, Choice, Media } from "@/lib/quiz";

/** ให้ choices เป็น 4 ช่องเสมอ */
function toTuple4<T>(arr: T[], filler: () => T): [T, T, T, T] {
  const a = arr.slice(0, 4);
  while (a.length < 4) a.push(filler());
  return a as [T, T, T, T];
}

/** บันทึกควิซขึ้น Firestore
 * - ถ้าเป็นควิซใหม่: ใส่ createdByUid/createdByUsername
 * - ถ้าแก้ไข: เช็คว่า owner ตรงกับผู้ล็อกอิน
 * - เขียน subcollection questions โดยเคลียร์ของเดิมก่อน
 * - ป้องกัน undefined ทุกฟิลด์ที่จะเขียน (โดยเฉพาะ answers/choices)
 */
export async function saveQuizToFirestore(quiz: Quiz) {
  const me = auth.currentUser;
  if (!me) throw new Error("ต้องล็อกอินก่อนบันทึกควิซ");

  const ref = doc(db, "quizzes", quiz.id);
  const snap = await getDoc(ref);

  let createdByUid = snap.exists()
    ? (snap.data().createdByUid as string | undefined)
    : undefined;

  if (!snap.exists()) {
    // ควิซใหม่ -> ตั้ง owner
    createdByUid = me.uid;

    // เติม username ถ้ามี
    let createdByUsername: string | undefined = undefined;
    try {
      const userSnap = await getDoc(doc(db, "users", me.uid));
      createdByUsername =
        (userSnap.exists() && (userSnap.data().username as string)) || undefined;
    } catch {}

    await setDoc(
      ref,
      {
        id: quiz.id,
        title: quiz.title ?? "",
        description: quiz.description ?? "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdByUid,
        createdByUsername,
      },
      { merge: true }
    );
  } else {
    // ควิซเดิม -> อนุญาตเฉพาะเจ้าของ
    if (createdByUid && createdByUid !== me.uid) {
      throw new Error("คุณไม่ใช่เจ้าของควิซนี้ ไม่สามารถแก้ไขได้");
    }
    await setDoc(
      ref,
      {
        title: quiz.title ?? "",
        description: quiz.description ?? "",
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  // เคลียร์ questions เดิมทั้งหมดก่อนเขียนใหม่
  const qCol = collection(ref, "questions");
  const oldQs = await getDocs(qCol);
  if (!oldQs.empty) {
    const bdel = writeBatch(db);
    oldQs.forEach((d) => bdel.delete(d.ref));
    await bdel.commit();
  }

  // เขียน questions ใหม่ (ห้ามมี undefined)
  if (quiz.questions?.length) {
    const b = writeBatch(db);
    quiz.questions.forEach((q, idx) => {
      const qref = doc(qCol, q.id);
      const base: any = {
        order: idx,
        type: q.type,
        timeLimitSec: Number(q.timeLimitSec ?? 10),
        readTimeSec: Number(q.readTimeSec ?? 5),
        media: q.media ?? {},
      };

      if (q.type === "choice") {
        const raw = (q.choices ?? []) as Choice[];
        const safeChoices = toTuple4<Choice>(raw, () => ({
          id: crypto.randomUUID(),
          correct: false,
          media: {} as Media,
        })).map((c) => ({
          id: c.id,
          correct: !!c.correct,
          media: c.media ?? {},
        }));
        base.choices = safeChoices;
        // อย่าใส่ answers เลย
      } else {
        // input
        const answers = (q.answers ?? [])
          .map((s) => String(s ?? "").trim())
          .filter(Boolean);
        base.answers = answers; // [] ก็โอเค ไม่ error
        // อย่าใส่ choices เลย
      }

      b.set(qref, base);
    });
    await b.commit();
  }
}

/** ลบควิซทั้งชุด (รวม subcollections) — อนุญาตเฉพาะเจ้าของ */
export async function deleteQuizFromFirestore(id: string) {
  const me = auth.currentUser;
  if (!me) throw new Error("ต้องล็อกอินก่อนลบควิซ");

  const ref = doc(db, "quizzes", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  if (snap.data().createdByUid && snap.data().createdByUid !== me.uid) {
    throw new Error("คุณไม่ใช่เจ้าของควิซนี้ ไม่สามารถลบได้");
  }

  // ลบ subcollection questions
  const qCol = collection(ref, "questions");
  const qs = await getDocs(qCol);
  if (!qs.empty) {
    const b = writeBatch(db);
    qs.forEach((d) => b.delete(d.ref));
    await b.commit();
  }

  // ลบ plays ด้วย (ถ้าต้องการไม่เก็บสถิติ)
  const pCol = collection(ref, "plays");
  const ps = await getDocs(pCol);
  if (!ps.empty) {
    const b2 = writeBatch(db);
    ps.forEach((d) => b2.delete(d.ref));
    await b2.commit();
  }

  await deleteDoc(ref);
}

/** โหลดรายการควิซ (อ่านได้ทุกคน) */
export async function fetchQuizzes() {
  const q = query(collection(db, "quizzes"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
}

/** โหลดควิซสำหรับหน้า "เล่น"
 * - return เป็น Quiz ครบ field title/description เพื่อไม่ error เวลา render
 * - choices จะได้ 4 ตัวเสมอ
 * - answers เป็น array เสมอ (ไม่ undefined)
 */
export async function loadQuizForPlay(id: string): Promise<Quiz> {
  const ref = doc(db, "quizzes", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("ไม่พบควิซนี้");

  const data = snap.data() as any;

  const qCol = collection(ref, "questions");
  const qs = await getDocs(qCol);
  const questions: QuizQuestion[] = qs.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((q: any) => {
      const base: any = {
        id: q.id,
        type: q.type,
        timeLimitSec: Number(q.timeLimitSec ?? 10),
        readTimeSec: Number(q.readTimeSec ?? 5),
        media: q.media ?? {},
      };
      if (q.type === "choice") {
        const raw = (q.choices ?? []) as Choice[];
        base.choices = toTuple4<Choice>(raw, () => ({
          id: crypto.randomUUID(),
          correct: false,
          media: {} as Media,
        })).map((c) => ({
          id: c.id,
          correct: !!c.correct,
          media: c.media ?? {},
        })) as [Choice, Choice, Choice, Choice];
      } else {
        base.answers = (q.answers ?? [])
          .map((s: any) => String(s ?? "").trim())
          .filter(Boolean) as string[];
      }
      return base as QuizQuestion;
    });

  const quiz: Quiz = {
    id: snap.id,
    title: data.title ?? "",
    description: data.description ?? "",
    createdAt: Number(data.createdAt?.toMillis?.() ?? Date.now()),
    questions,
  };
  return quiz;
}

/** โหลดควิซสำหรับหน้า "แก้ไข"
 * - รวม createdByUid เพื่อเช็ค owner ในหน้า editor
 * - รูปแบบคำถามเหมือนที่ editor ใช้ (choices 4, answers [])
 */
export async function loadQuizForEdit(id: string): Promise<
  Quiz & { createdByUid?: string | null; createdByUsername?: string | null }
> {
  const ref = doc(db, "quizzes", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("ไม่พบควิซนี้");

  const data = snap.data() as any;
  const createdByUid = (data.createdByUid as string | undefined) ?? null;
  const createdByUsername = (data.createdByUsername as string | undefined) ?? null;

  const qCol = collection(ref, "questions");
  const qs = await getDocs(qCol);
  const questions: QuizQuestion[] = qs.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((q: any) => {
      const base: any = {
        id: q.id,
        type: q.type,
        timeLimitSec: Number(q.timeLimitSec ?? 10),
        readTimeSec: Number(q.readTimeSec ?? 5),
        media: q.media ?? {},
      };
      if (q.type === "choice") {
        const raw = (q.choices ?? []) as Choice[];
        base.choices = toTuple4<Choice>(raw, () => ({
          id: crypto.randomUUID(),
          correct: false,
          media: {} as Media,
        })).map((c) => ({
          id: c.id,
          correct: !!c.correct,
          media: c.media ?? {},
        })) as [Choice, Choice, Choice, Choice];
      } else {
        base.answers = (q.answers ?? [])
          .map((s: any) => String(s ?? "").trim())
          .filter(Boolean) as string[];
      }
      return base as QuizQuestion;
    });

  const quiz: Quiz & {
    createdByUid?: string | null;
    createdByUsername?: string | null;
  } = {
    id: snap.id,
    title: data.title ?? "",
    description: data.description ?? "",
    createdAt: Number(data.createdAt?.toMillis?.() ?? Date.now()),
    questions,
    createdByUid,
    createdByUsername,
  };

  return quiz;
}
