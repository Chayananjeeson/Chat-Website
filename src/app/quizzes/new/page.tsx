// src/app/quizzes/[id]/../new/page.tsx  (ตำแหน่งเดิมของหน้า editor)
"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

import {
  uuid,
  type Quiz,
  type QuizQuestion,
  type Choice,
  type Media,
  type QuestionType,
  fileToDataUrl,
} from "@/lib/quiz";

import {
  saveQuizToFirestore,
  loadQuizForEdit,
} from "@/lib/quizFirestore";

import { auth, db } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

/** บังคับให้ choices เป็น tuple 4 ตัวเสมอ */
function asTuple4<T>(arr: T[], filler: () => T): [T, T, T, T] {
  const a = arr.slice(0, 4);
  while (a.length < 4) a.push(filler());
  return a as [T, T, T, T];
}
const newChoice = (): Choice => ({ id: uuid(), correct: false, media: {} as Media });

/** แปลงตัวเลขเวลาให้เป็นบวกและเป็น int */
const safeInt = (n: number | undefined, fallback: number) => {
  const x = Math.floor(Number(n));
  return Number.isFinite(x) && x > 0 ? x : fallback;
};

export default function QuizEditorPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const editId = sp.get("id");

  const [meUid, setMeUid] = useState<string | null>(null);
  const [meUsername, setMeUsername] = useState<string | null>(null);

  // login state + username
  useEffect(() => {
    const off = onAuthStateChanged(auth, async (u) => {
      setMeUid(u?.uid ?? null);
      if (u) {
        const us = await getDoc(doc(db, "users", u.uid));
        setMeUsername(us.exists() ? ((us.data().username as string) ?? null) : null);
      }
    });
    return () => off();
  }, []);

  // state ควิซเริ่มต้น (ควิซใหม่)
  const [quiz, setQuiz] = useState<Quiz>({
    id: uuid(),
    title: "",
    description: "",
    createdAt: Date.now(),
    questions: [],
  });
  const [loading, setLoading] = useState<boolean>(!!editId);

  // ถ้ามี id -> โหลดจาก Firestore
  useEffect(() => {
    if (!editId) return;
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const q = await loadQuizForEdit(editId);
        if (!alive) return;

        // (ถ้าต้องการเช็ค owner: q.createdByUid === meUid ก็แจ้งเตือนได้)
        setQuiz({
          id: q.id,
          title: q.title ?? "",
          description: q.description ?? "",
          createdAt: q.createdAt ?? Date.now(),
          questions: q.questions, // loadQuizForEdit ให้รูปแบบตรง editor แล้ว
        });
      } catch (e) {
        console.error("โหลดควิซสำหรับแก้ไขล้มเหลว:", e);
        alert("ไม่พบควิซนี้ หรือคุณไม่มีสิทธิ์เข้าถึง");
        router.replace("/quizzes");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [editId, router]);

  const makeBase = (type: QuestionType): QuizQuestion =>
    type === "choice"
      ? {
          id: uuid(),
          type: "choice",
          timeLimitSec: 10,
          readTimeSec: 5,
          media: {} as Media,
          choices: asTuple4<Choice>([], newChoice),
        }
      : {
          id: uuid(),
          type: "input",
          timeLimitSec: 10,
          readTimeSec: 5,
          media: {} as Media,
          answers: [""],
        };

  const addQuestion = (type: QuestionType) => {
    setQuiz((q) => ({ ...q, questions: [...q.questions, makeBase(type)] }));
  };

  const updateQuestion = (qid: string, update: Partial<QuizQuestion>) => {
    setQuiz((q) => ({
      ...q,
      questions: q.questions.map((it) =>
        it.id === qid
          ? {
              ...it,
              ...update,
              ...(update.choices
                ? { choices: asTuple4(update.choices as Choice[], newChoice) }
                : null),
            }
          : it
      ),
    }));
  };

  const updateChoice = (qid: string, cid: string, update: Partial<Choice>) => {
    setQuiz((q) => ({
      ...q,
      questions: q.questions.map((it) => {
        if (it.id !== qid || !it.choices) return it;
        const nextChoices = asTuple4(
          it.choices.map((c) => (c.id === cid ? { ...c, ...update } : c)),
          newChoice
        );
        return { ...it, choices: nextChoices };
      }),
    }));
  };

  const handleFile = async (
    qid: string,
    target: "question" | string,
    file: File | null
  ) => {
    if (!file) return;
    const url = await fileToDataUrl(file);
    if (target === "question") {
      const current = quiz.questions.find((x) => x.id === qid)?.media || {};
      updateQuestion(qid, { media: { ...current, dataUrl: url } });
    } else {
      updateChoice(qid, target, { media: { dataUrl: url } as Media });
    }
  };

  const handleSave = async () => {
    if (!meUid) {
      alert("ต้องล็อกอินก่อนบันทึกควิซ");
      return;
    }
    if (!quiz.title.trim()) {
      alert("กรุณากรอกชื่อควิซ");
      return;
    }

    // sanitize ก่อนส่ง
    const cleaned: Quiz = {
      ...quiz,
      title: quiz.title.trim(),
      description: quiz.description ?? "",
      questions: quiz.questions.map((q, idx) =>
        q.type === "choice"
          ? {
              ...q,
              type: "choice",
              timeLimitSec: safeInt(q.timeLimitSec, 10),
              readTimeSec: safeInt(q.readTimeSec, 5),
              media: q.media ?? {},
              choices: asTuple4(q.choices ?? [], newChoice).map((c) => ({
                id: c.id,
                correct: !!c.correct,
                media: c.media ?? {},
              })) as [Choice, Choice, Choice, Choice],
              // editor ไม่ใช้ order แต่ back จะใช้เรียง -> ให้ไปด้วย
              // (type QuizQuestion ไม่มี order ก็ไม่เป็นไร ฝั่ง Firestore จะอ่านค่า idx เอง)
            }
          : {
              ...q,
              type: "input",
              timeLimitSec: safeInt(q.timeLimitSec, 10),
              readTimeSec: safeInt(q.readTimeSec, 5),
              media: q.media ?? {},
              answers: (q.answers ?? [])
                .map((s) => (s ?? "").trim())
                .filter(Boolean),
            }
      ),
    };

    try {
      await saveQuizToFirestore(cleaned);
      router.push("/quizzes");
    } catch (e) {
      console.error(e);
      alert("บันทึกควิซไม่สำเร็จ");
    }
  };

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <div className="rounded border p-6 text-slate-500">กำลังโหลด…</div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/quizzes" className="text-sm underline text-slate-600">
          ← กลับ
        </Link>
        <h1 className="text-2xl font-bold">สร้าง / แก้ไขควิซ</h1>
        <span className="ml-auto text-xs text-slate-600">
          {meUid ? `ผู้ใช้: ${meUsername ? "@" + meUsername : meUid.slice(0, 8)}` : "ยังไม่ล็อกอิน"}
        </span>
      </div>

      {/* quiz info */}
      <div className="rounded-xl border bg-white p-4 space-y-3">
        <input
          type="text"
          placeholder="ชื่อควิซ"
          className="w-full border rounded-lg p-2"
          value={quiz.title}
          onChange={(e) => setQuiz({ ...quiz, title: e.target.value })}
        />
        <textarea
          placeholder="คำอธิบาย (ไม่บังคับ)"
          className="w-full border rounded-lg p-2"
          rows={2}
          value={quiz.description}
          onChange={(e) => setQuiz({ ...quiz, description: e.target.value })}
        />
      </div>

      {/* questions */}
      <div className="space-y-6">
        {quiz.questions.map((q, idx) => (
          <div
            key={q.id}
            className="rounded-xl border bg-white p-4 space-y-3 shadow-sm"
          >
            <div className="flex justify-between items-center">
              <div className="font-semibold">
                ข้อ {idx + 1}{" "}
                <span className="text-xs text-slate-500">({q.type})</span>
              </div>
              <button
                onClick={() =>
                  setQuiz((all) => ({
                    ...all,
                    questions: all.questions.filter((x) => x.id !== q.id),
                  }))
                }
                className="text-rose-600 text-sm hover:underline"
              >
                ลบ
              </button>
            </div>

            {/* Question text & image */}
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-slate-600">ข้อความคำถาม</label>
                <textarea
                  className="w-full border rounded-lg p-2"
                  rows={3}
                  value={q.media.text || ""}
                  onChange={(e) =>
                    updateQuestion(q.id, {
                      media: { ...q.media, text: e.target.value },
                    })
                  }
                />
              </div>
              <div>
                <label className="text-sm text-slate-600">รูปภาพคำถาม</label>
                {q.media.dataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={q.media.dataUrl}
                    alt=""
                    className="max-h-40 mb-2 rounded border object-contain"
                  />
                )}
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    handleFile(q.id, "question", e.target.files?.[0] || null)
                  }
                />
              </div>
            </div>

            {/* เวลา */}
            <div className="grid md:grid-cols-2 gap-3 mt-2">
              <div>
                <label className="text-sm text-slate-600">เวลาต่อข้อ (วินาที)</label>
                <input
                  type="number"
                  min={5}
                  className="w-full border rounded-lg p-2"
                  value={q.timeLimitSec}
                  onChange={(e) =>
                    updateQuestion(q.id, {
                      timeLimitSec: parseInt(e.target.value || "0", 10),
                    })
                  }
                />
              </div>
              <div>
                <label className="text-sm text-slate-600">เวลาอ่านโจทย์ (วินาที)</label>
                <input
                  type="number"
                  min={1}
                  className="w-full border rounded-lg p-2"
                  value={q.readTimeSec ?? 5}
                  onChange={(e) =>
                    updateQuestion(q.id, {
                      readTimeSec: parseInt(e.target.value || "0", 10),
                    })
                  }
                />
              </div>
            </div>

            {/* UI ตามชนิดคำถาม */}
            {q.type === "choice" ? (
              <div className="grid md:grid-cols-2 gap-4 mt-3">
                {q.choices?.map((c, cidx) => (
                  <div key={c.id} className="border rounded-lg p-3 bg-slate-50">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium">คำตอบ {cidx + 1}</span>
                      <label className="text-sm flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={c.correct}
                          onChange={(e) =>
                            updateChoice(q.id, c.id, { correct: e.target.checked })
                          }
                        />
                        ถูก
                      </label>
                    </div>
                    <textarea
                      className="w-full border rounded p-1 mb-2"
                      placeholder="ข้อความคำตอบ"
                      value={c.media.text || ""}
                      onChange={(e) =>
                        updateChoice(q.id, c.id, {
                          media: { ...c.media, text: e.target.value },
                        })
                      }
                    />
                    {c.media.dataUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={c.media.dataUrl}
                        alt=""
                        className="max-h-24 mb-2 rounded border object-contain"
                      />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        handleFile(q.id, c.id, e.target.files?.[0] || null)
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3">
                <div className="text-sm text-slate-600 mb-2">
                  คำตอบที่ยอมรับได้ (เพิ่มได้หลายอัน เช่น 「さん」 และ “san”)
                </div>
                <div className="space-y-2">
                  {(q.answers || []).map((ans, idxAns) => (
                    <div key={idxAns} className="flex gap-2">
                      <input
                        type="text"
                        className="flex-1 border rounded p-2"
                        placeholder={`คำตอบที่ ${idxAns + 1}`}
                        value={ans}
                        onChange={(e) => {
                          const next = [...(q.answers || [])];
                          next[idxAns] = e.target.value;
                          updateQuestion(q.id, { answers: next });
                        }}
                      />
                      <button
                        className="px-2 rounded border hover:bg-slate-50"
                        onClick={() => {
                          const next = [...(q.answers || [])];
                          next.splice(idxAns, 1);
                          updateQuestion(q.id, { answers: next });
                        }}
                      >
                        ลบ
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  className="mt-2 px-3 py-1.5 rounded border bg-slate-50 hover:bg-slate-100"
                  onClick={() =>
                    updateQuestion(q.id, { answers: [...(q.answers || []), ""] })
                  }
                >
                  + เพิ่มคำตอบ
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => addQuestion("choice")}
          className="px-3 py-2 rounded-lg border bg-emerald-50 hover:bg-emerald-100"
        >
          + เพิ่มคำถามแบบตัวเลือก
        </button>
        <button
          onClick={() => addQuestion("input")}
          className="px-3 py-2 rounded-lg border bg-blue-50 hover:bg-blue-100"
        >
          + เพิ่มคำถามแบบพิมพ์ตอบ
        </button>

        <button
          onClick={handleSave}
          disabled={!meUid}
          className="ml-auto px-4 py-2 rounded-lg border bg-indigo-50 hover:bg-indigo-100 disabled:opacity-60"
          title={!meUid ? "ต้องล็อกอินก่อนบันทึก" : ""}
        >
          💾 บันทึกควิซ
        </button>
      </div>
    </main>
  );
}
