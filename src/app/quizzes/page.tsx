"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { fetchQuizzes, deleteQuizFromFirestore } from "@/lib/quizFirestore";

type QuizRow = {
  id: string;
  title: string;
  description?: string;
  questionsCount?: number;
  createdByUid?: string;
  createdByUsername?: string;
};

export default function QuizzesHomePage() {
  const [meUid, setMeUid] = useState<string | null>(null);
  const [items, setItems] = useState<QuizRow[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const off = onAuthStateChanged(auth, (u) => setMeUid(u?.uid ?? null));
    return () => off();
  }, []);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const list = await fetchQuizzes();
        setItems(
          list.map((q: any) => ({
            id: q.id,
            title: q.title,
            description: q.description,
            questionsCount: q.questionsCount ?? undefined,
            createdByUid: q.createdByUid,
            createdByUsername: q.createdByUsername,
          }))
        );
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  const onDelete = async (id: string) => {
    if (!confirm("ลบควิซนี้ (รวมคำถามทั้งหมด) ?")) return;
    try {
      setBusyId(id);
      await deleteQuizFromFirestore(id);
      setItems((prev) => prev.filter((x) => x.id !== id));
    } catch (e: any) {
      alert(e?.message || "ลบไม่สำเร็จ");
      console.error(e);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="max-w-4xl mx-auto p-6">
      <div className="flex items-center gap-2 mb-4">
        <h1 className="text-2xl font-bold">Quiz</h1>
        <Link
          href={`/quizzes/new`}
          className="ml-auto px-3 py-2 rounded-lg border bg-emerald-50 hover:bg-emerald-100"
          title={meUid ? "" : "ต้องล็อกอินเพื่อสร้างควิซ"}
          aria-disabled={!meUid}
          style={!meUid ? { pointerEvents: "none", opacity: 0.6 } : {}}
        >
          + สร้างควิซใหม่
        </Link>
      </div>

      {loading ? (
        <div className="rounded-lg border p-6 text-slate-500">กำลังโหลด...</div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border p-6 text-slate-500">
          ยังไม่มีควิซ
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {items.map((q) => {
            const isOwner = meUid && q.createdByUid === meUid;
            return (
              <div key={q.id} className="rounded-lg border p-4 bg-white">
                <div className="font-semibold">{q.title}</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  ผู้สร้าง:{" "}
                  {q.createdByUsername
                    ? `@${q.createdByUsername}`
                    : q.createdByUid
                    ? q.createdByUid.slice(0, 8)
                    : "ไม่ทราบ"}
                </div>
                {q.description && (
                  <div className="text-sm text-slate-600 mt-1 line-clamp-2">
                    {q.description}
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/quizzes/${q.id}/play`}
                    className="px-3 py-1.5 rounded-lg border hover:bg-slate-50"
                  >
                    ▶️ เล่น
                  </Link>

                  {isOwner && (
                    <>
                      <Link
                        href={`/quizzes/new?id=${q.id}`}
                        className="px-3 py-1.5 rounded-lg border hover:bg-slate-50"
                      >
                        ✏️ แก้ไข
                      </Link>
                      <button
                        onClick={() => onDelete(q.id)}
                        disabled={busyId === q.id}
                        className="px-3 py-1.5 rounded-lg border hover:bg-rose-50 text-rose-600 disabled:opacity-50"
                      >
                        {busyId === q.id ? "กำลังลบ..." : "ลบ"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </main>
  );
}
