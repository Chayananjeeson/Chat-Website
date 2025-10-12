"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { loadQuizForPlay } from "@/lib/quizFirestore";
import type { QuizQuestion } from "@/lib/quiz";

const COLORS = ["#ef4444", "#3b82f6", "#f59e0b", "#22c55e"] as const;
type Phase = "reading" | "answering";

const AUTO_NEXT_DELAY_MS = 350; // ใช้กับกรณีผิดเท่านั้น (ถูกจะรอเสียงจบ)
const VOL_KEY = "kenchat_quiz_volume_v1";
const DEFAULT_VOL = 0.6;

type PlayQuiz = {
  id: string;
  title: string;
  description?: string;
  questions: QuizQuestion[];
};

function safeSec(val: number | undefined, fallback: number) {
  const n = Number(val);
  if (!Number.isFinite(n) || n <= 0) return Math.max(1, fallback | 0);
  return Math.max(1, Math.floor(n));
}

export default function QuizPlayPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [quiz, setQuiz] = useState<PlayQuiz | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const q = await loadQuizForPlay(id);
        const normalized: PlayQuiz = {
          id: q.id,
          title: q.title ?? "(ไม่มีชื่อควิซ)",
          description: q.description ?? "",
          questions: Array.isArray(q.questions) ? q.questions : [],
        };
        if (alive) setQuiz(normalized);
      } catch (err) {
        console.error("โหลด quiz จาก Firestore ล้มเหลว:", err);
        if (alive) setQuiz(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const [i, setI] = useState(0);
  const [phase, setPhase] = useState<Phase>("reading");
  const [sec, setSec] = useState(0);
  const [locked, setLocked] = useState(true);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [volume, setVolume] = useState<number>(DEFAULT_VOL);

  // ===== Audio Refs =====
  const tickAudio = useRef<HTMLAudioElement | null>(null);
  const alarmAudio = useRef<HTMLAudioElement | null>(null);
  const correctAudio = useRef<HTMLAudioElement | null>(null);
  const wrongAudio = useRef<HTMLAudioElement | null>(null);
  const stopTimerRef = useRef<number | null>(null);

  // กันไม่ให้เอฟเฟกต์ถอยหลัง “ข้ามช่วงอ่าน” ในวินาทีแรกของคำถามใหม่
  const justLoadedRef = useRef(false);

  // ===== Volume init/load =====
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VOL_KEY);
      if (raw) setVolume(Math.max(0, Math.min(1, Number(raw))));
    } catch {}
  }, []);

  const applyVolume = (v: number) => {
    const vv = Math.max(0, Math.min(1, v));
    setVolume(vv);
    try {
      localStorage.setItem(VOL_KEY, String(vv));
    } catch {}
    if (tickAudio.current) tickAudio.current.volume = vv;
    if (alarmAudio.current) alarmAudio.current.volume = vv;
    if (correctAudio.current) correctAudio.current.volume = vv;
    if (wrongAudio.current) wrongAudio.current.volume = vv;
  };

  // ===== Helpers: stop all sounds =====
  const stopTickSound = () => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    const a = tickAudio.current;
    if (a) {
      try {
        a.pause();
        a.currentTime = 0;
      } catch {}
    }
  };
  const stopAlarmSound = () => {
    const a = alarmAudio.current;
    if (a) {
      try {
        a.pause();
        a.currentTime = 0;
      } catch {}
    }
  };
  const stopOneShotSounds = () => {
    [correctAudio.current, wrongAudio.current].forEach((a) => {
      if (!a) return;
      try {
        a.pause();
        a.currentTime = 0;
      } catch {}
    });
  };
  const stopAllSounds = () => {
    stopTickSound();
    stopAlarmSound();
    stopOneShotSounds();
  };

  // คำถามปัจจุบัน
  const q: QuizQuestion | undefined = quiz?.questions[i];

  /* ===== Start ticking (answering) ===== */
  const startTickSound = (limitSec: number) => {
    stopTickSound();
    const playSec = safeSec(limitSec, 10);
    if (!tickAudio.current) {
      tickAudio.current = new Audio(
        "/quiz/sound/clock-ticking-60-second-countdown-118231.mp3"
      );
      tickAudio.current.loop = false;
    }
    const a = tickAudio.current;
    try {
      a.currentTime = 0;
      a.volume = volume;
      a.play().catch(() => {});
      stopTimerRef.current = window.setTimeout(
        () => stopTickSound(),
        playSec * 1000
      );
    } catch {}
  };

  /* ===== Play timeout alarm (2s + fade) then auto-next ===== */
  const playAlarmSound = () => {
    stopTickSound();
    if (!alarmAudio.current) {
      alarmAudio.current = new Audio("/quiz/sound/alarm_clock.mp3");
      alarmAudio.current.loop = false;
    }
    const a = alarmAudio.current;
    try {
      a.currentTime = 0;
      a.volume = volume;
      a.play().catch(() => {});

      const duration = 2000; // 2s
      const steps = 20;
      const delta = a.volume / steps;
      const fade = setInterval(() => {
        a.volume = Math.max(0, a.volume - delta);
      }, duration / steps);

      setTimeout(() => {
        clearInterval(fade);
        a.pause();
        a.currentTime = 0;
      }, duration);

      setTimeout(() => next(), duration + 200);
    } catch {}
  };

  /* ===== Correct / Wrong sounds ===== */
  // ✅ เวอร์ชันใหม่: เล่นเสียง "ถูก" ให้จบก่อน แล้ว resolve
  const playCorrectSoundAndWait = () => {
    stopOneShotSounds();
    if (!correctAudio.current) {
      correctAudio.current = new Audio("/quiz/sound/bmw-check-oshibka.mp3");
      correctAudio.current.loop = false;
    }
    const a = correctAudio.current;

    return new Promise<void>((resolve) => {
      const done = () => {
        try {
          a.pause();
          a.currentTime = 0;
        } catch {}
        resolve();
      };

      try {
        a.currentTime = 0;
        a.volume = volume;

        // เผื่อบางเบราว์เซอร์ไม่ยิง ended ให้ fallback ตาม duration ของไฟล์
        const fallbackMs =
          Number.isFinite(a.duration) && a.duration > 0
            ? Math.ceil(a.duration * 1000) + 80
            : 1200;

        const to = setTimeout(done, fallbackMs);
        a.addEventListener(
          "ended",
          () => {
            clearTimeout(to);
            done();
          },
          { once: true }
        );

        a.play().catch(() => {
          clearTimeout(to);
          resolve();
        });
      } catch {
        resolve();
      }
    });
  };

  const playWrongSound = () => {
    stopOneShotSounds();
    if (!wrongAudio.current) {
      wrongAudio.current = new Audio("/quiz/sound/wrong_SriFgVc.mp3");
      wrongAudio.current.loop = false;
    }
    try {
      const a = wrongAudio.current;
      a.currentTime = 0;
      a.volume = volume;
      a.play().catch(() => {});
    } catch {}
  };

  /* ===== New question init ===== */
  useEffect(() => {
    if (!q) return;
    setPicked(null);
    setTyped("");
    setLocked(true);
    setPhase("reading");
    const read = safeSec(q.readTimeSec ?? 5, 5);
    // บอกเอฟเฟกต์ตัวจับเวลาให้ “ข้ามการเช็ค sec<=0” เฉพาะติ๊กแรกของคำถามใหม่
    justLoadedRef.current = true;
    setSec(read);
    stopAllSounds();
  }, [i, q?.id]);

  /* ===== Timer by phase (ขับด้วย sec) ===== */
  useEffect(() => {
    if (!q) return;

    // ติ๊กแรกหลังเปลี่ยนข้อ: อย่าประมวลผล "sec<=0" แต่ให้ตั้งถอยหลัง 1 วินาทีไปก่อน
    if (justLoadedRef.current) {
      justLoadedRef.current = false;
      const t0 = window.setTimeout(() => {
        setSec((s) => (Number.isFinite(s) ? s - 1 : 0));
      }, 1000);
      return () => clearTimeout(t0);
    }

    // ถึงรอบประมวลผลปกติ
    if (sec <= 0) {
      if (phase === "reading") {
        const limit = safeSec(q.timeLimitSec, 10);
        setPhase("answering");
        setLocked(false);
        setSec(limit);
        startTickSound(limit);
      } else {
        setLocked(true); // หมดเวลา
        playAlarmSound();
      }
      return;
    }

    const t = window.setTimeout(() => {
      setSec((s) => (Number.isFinite(s) ? s - 1 : 0));
    }, 1000);
    return () => clearTimeout(t);
  }, [sec, phase, q?.id]);

  // cleanup เสียงเมื่อออกจากหน้า
  useEffect(() => () => stopAllSounds(), []);

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <div className="rounded border p-6 text-slate-500">กำลังโหลด…</div>
      </main>
    );
  }
  if (!quiz || !q) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <div className="rounded border p-6">ไม่พบควิซนี้</div>
      </main>
    );
  }

  const norm = (s: string) => s.normalize("NFKC").trim().toLowerCase();

  const next = () => {
    stopAllSounds();
    if (i < quiz.questions.length - 1) {
      setI((x) => x + 1);
    } else {
      alert(`จบควิซ!\nคะแนนรวม: ${score}`);
      router.replace("/quizzes");
    }
  };

  // ✅ รอให้เสียง "ถูก" เล่นจนจบ แล้วค่อยไปข้อถัดไป
  const onCorrect = async () => {
    setScore((s) => s + 100);
    setLocked(true);
    stopTickSound();
    await playCorrectSoundAndWait();
    next();
  };

  const onWrong = () => {
    setLocked(true);
    stopTickSound();
    playWrongSound();
    setTimeout(next, AUTO_NEXT_DELAY_MS);
  };

  const choose = (idx: number) => {
    if (locked || phase !== "answering" || !q.choices) return;
    setPicked(idx);
    const ok = q.choices[idx].correct;
    if (ok) onCorrect();
    else onWrong();
  };

  const checkTyped = () => {
    if (locked || phase !== "answering" || !q.answers) return;
    const ok = q.answers.some((a) => norm(a) === norm(typed));
    if (ok) onCorrect();
    else onWrong();
  };

  const inReading = phase === "reading";

  return (
    <main className="max-w-5xl mx-auto p-4 md:p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="text-lg font-semibold">{quiz.title}</div>
        <div className="text-sm text-slate-500">
          {i + 1} / {quiz.questions.length}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 md:p-6">
        {/* Header: timer + volume + score */}
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-violet-600 text-white flex items-center justify-center text-xl font-bold">
              {sec}
            </div>
            <div className="text-slate-500">
              {inReading ? "อ่านโจทย์" : "วินาที"}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <span className="text-slate-600">เสียง</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(e) => applyVolume(Number(e.target.value) / 100)}
            />
            <span className="text-slate-500 w-10 text-right">
              {Math.round(volume * 100)}%
            </span>
          </label>

          <div className="text-slate-600 ml-auto">
            คะแนน: <span className="font-semibold">{score}</span>
          </div>
        </div>

        {/* Question */}
        <div className="rounded-lg border p-6 bg-white text-center flex flex-col items-center justify-center min-h-[220px] animate-fade-up">
          {q.media.dataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={q.media.dataUrl}
              alt=""
              className={`max-h-56 object-contain mx-auto ${
                q.media.text ? "mb-3" : ""
              }`}
            />
          )}
          {q.media.text ? (
            <div className="text-xl leading-snug">{q.media.text}</div>
          ) : !q.media.dataUrl ? (
            <div className="text-slate-400">— ไม่มีคำถาม —</div>
          ) : null}
        </div>

        {/* Answer area */}
        {!inReading && (
          <>
            {q.type === "input" ? (
              <div className="mt-4 animate-fade-up">
                <div className="rounded-lg border p-4 bg-slate-50 text-center">
                  <input
                    type="text"
                    className="w-full border rounded-lg p-3 mb-3"
                    placeholder="พิมพ์คำตอบที่นี่..."
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") checkTyped();
                    }}
                    disabled={locked}
                  />
                  <button
                    onClick={checkTyped}
                    disabled={locked}
                    className="px-4 py-2 rounded-lg border bg-white hover:bg-slate-100"
                  >
                    ตรวจคำตอบ
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-3 mt-4">
                {q.choices?.map((c, idx) => {
                  const bg = COLORS[idx % COLORS.length];
                  const chosen = picked === idx;
                  const state =
                    locked && chosen
                      ? c.correct
                        ? "ring-emerald-500"
                        : "ring-rose-500"
                      : locked && c.correct
                      ? "ring-emerald-500"
                      : "ring-transparent";

                  return (
                    <button
                      key={c.id}
                      onClick={() => choose(idx)}
                      disabled={locked}
                      className={`rounded-lg p-4 text-left text-white shadow ring-4 ${state} animate-choice-in`}
                      style={{
                        background: bg,
                        opacity: locked && !chosen ? 0.9 : 1,
                        animationDelay: `${idx * 80}ms`,
                      }}
                    >
                      <div className="grid grid-cols-2 gap-3 items-center">
                        <div className="text-lg md:text-xl font-semibold">
                          {c.media.text || "—"}
                        </div>
                        <div className="justify-self-end">
                          {c.media.dataUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={c.media.dataUrl}
                              alt=""
                              className="max-h-20 object-contain rounded-md bg-white/10"
                            />
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* Animations */}
      <style jsx>{`
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .animate-fade-up {
          animation: fadeUp 260ms ease-out both;
        }
        @keyframes choiceIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-choice-in {
          animation: choiceIn 260ms ease-out both;
        }
      `}</style>
    </main>
  );
}
