"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";

/* ---------- Types ---------- */
type MinnaRow = {
  Meaning?: string;
  Kanji?: string;
  "Hiragana/Katakana"?: string;
  Romaji?: string;
};

type KanjiRow = {
  Kanji?: string;
  Meaning?: string; // map จาก "Meaning (TH)"
  "Onyomi (JP)"?: string;
  "Onyomi (Romaji)"?: string;
  "Kunyomi (JP)"?: string;
  "Kunyomi (Romaji)"?: string;
  "Vocabulary (JP)"?: string;
  "Vocabulary (Romaji)"?: string;
  "Vocabulary (TH)"?: string;
};

/* ---------- Utils ---------- */
async function fetchXlsxOnce(path: string) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`โหลดไฟล์ไม่สำเร็จ: ${path}`);
  const ab = await res.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<any>(sheet, { defval: "" });
}

function normalizeLessonId(raw: string) {
  return raw.replace(/lesson/gi, "").replace(/[^\d]/g, "") || raw;
}

function normalizeKeys<T extends object>(row: any): T {
  const map: Record<string, string> = {
    kanji: "Kanji",
    romaji: "Romaji",
    "hiragana/katakana": "Hiragana/Katakana",
    hiragana: "Hiragana/Katakana",
    katakana: "Hiragana/Katakana",
    meaning: "Meaning",
    "meaning (th)": "Meaning",
    ความหมาย: "Meaning",
    "vocabulary (th)": "Vocabulary (TH)",
    "onyomi (jp)": "Onyomi (JP)",
    "onyomi (romaji)": "Onyomi (Romaji)",
    "kunyomi (jp)": "Kunyomi (JP)",
    "kunyomi (romaji)": "Kunyomi (Romaji)",
    "vocabulary (jp)": "Vocabulary (JP)",
    "vocabulary (romaji)": "Vocabulary (Romaji)",
  };

  const out: any = {};
  for (const [k, v] of Object.entries(row)) {
    const key = typeof k === "string" ? k.trim() : k;
    const lower = typeof key === "string" ? key.toLowerCase() : key;
    const mapped = map[lower] ?? key;
    out[mapped] = v;
  }
  return out as T;
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ---------- Page ---------- */
export default function FlashcardsPlayPage() {
  const sp = useSearchParams();

  const kanjiParam = sp.get("kanji");
  const lessonsParam = sp.get("lessons");
  const isKanji = !!kanjiParam;

  const showJa = sp.get("showJa") === "1";
  const showRo = sp.get("showRo") === "1";
  const hideKanaIfHasKanji = sp.get("hideKanaIfHasKanji") === "1";
  const wantShuffle = sp.get("shuffle") === "1";

  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // สำหรับแอนิเมชัน
  const [bump, setBump] = useState(false);   // ดีดขึ้นก่อนพลิก
  const [cardKey, setCardKey] = useState(0); // trigger fade-in เมื่อเปลี่ยนการ์ด

  const crossCategoryError = useMemo(() => {
    if (kanjiParam && lessonsParam) {
      return "กรุณาเลือกอย่างใดอย่างหนึ่งระหว่าง Kanji หรือ Minna (ห้ามเลือกข้ามหมวด)";
    }
    return "";
  }, [kanjiParam, lessonsParam]);

  // โหลดข้อมูล
  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError("");

        if (crossCategoryError) {
          setCards([]);
          return;
        }

        let list: any[] = [];

        if (isKanji) {
          const levels = kanjiParam!
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

          for (const lv of levels) {
            // ✅ ใช้พาธที่ถูกต้องตามที่บอก
            const raw: KanjiRow[] = await fetchXlsxOnce(
              `/flashcards/jlpt_${lv}_kanji.xlsx`
            );
            const rows = raw.map((r) => normalizeKeys<KanjiRow>(r));
            const items = rows
              .filter(
                (r) =>
                  (r.Kanji || "").toString().trim() ||
                  (r.Meaning || "").toString().trim()
              )
              .map((r) => ({
                type: "kanji",
                front: (r.Kanji || "").toString(),
                back: (r.Meaning || "").toString(),
              }));
            list.push({ title: `JLPT ${lv.toUpperCase()}`, items });
          }
        } else if (lessonsParam) {
          const lessons = lessonsParam
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map(normalizeLessonId);

          for (const L of lessons) {
            const raw: MinnaRow[] = await fetchXlsxOnce(
              `/flashcards/minna_lesson_${L}.xlsx`
            );
            const rows = raw.map((r) => normalizeKeys<MinnaRow>(r));

            const items = rows.map((r) => {
              const kana = (r["Hiragana/Katakana"] || "").toString();
              const kanji = (r.Kanji || "").toString();
              const romaji = (r.Romaji || "").toString();
              const meaning = (r.Meaning || "").toString();

              const hasKanji =
                !!kanji && kanji !== "-" && /[一-龯々〆ヵヶ]/.test(kanji);

              let frontTopSmall = "";
              let frontMainBig = "";
              let frontBottomSmall = "";

              if (showJa) {
                if (hasKanji) {
                  if (hideKanaIfHasKanji) {
                    frontMainBig = kanji;
                    if (showRo && romaji) frontBottomSmall = romaji;
                  } else {
                    frontTopSmall = kana;
                    frontMainBig = kanji;
                    if (showRo && romaji) frontBottomSmall = romaji;
                  }
                } else {
                  frontMainBig = kana || romaji || meaning || "…";
                  if (showRo && romaji) frontBottomSmall = romaji;
                }
              } else {
                frontMainBig = showRo && romaji ? romaji : kana || kanji || "…";
              }

              return {
                type: "minna",
                frontTopSmall,
                frontMainBig,
                frontBottomSmall,
                back: meaning,
              };
            });

            list.push({ title: `Minna no Nihongo – บท ${L}`, items });
          }
        }

        const merged: any[] = [];
        list.forEach((sec) => {
          sec.items.forEach((it: any) =>
            merged.push({ ...it, __title: sec.title })
          );
        });
        const final = wantShuffle ? shuffleArray(merged) : merged;

        setCards(final);
        setIndex(0);
        setFlipped(false);
        setCardKey((k) => k + 1);
      } catch (e: any) {
        setError(e?.message || "เกิดข้อผิดพลาดในการโหลดไฟล์");
        setCards([]);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [
    kanjiParam,
    lessonsParam,
    showJa,
    showRo,
    hideKanaIfHasKanji,
    wantShuffle,
    crossCategoryError,
  ]);

  // คีย์ลัด
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        smoothFlip();
      } else if (e.key === "ArrowRight") {
        goNext();
      } else if (e.key === "ArrowLeft") {
        goPrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards.length]);

  const curr = cards[index];

  /* ---- Animation helpers ---- */
  function smoothFlip() {
    setBump(true);
    setTimeout(() => setFlipped((f) => !f), 120);
    setTimeout(() => setBump(false), 420);
  }
  function goNext() {
    setIndex((i) => {
      const nxt = Math.min(cards.length - 1, i + 1);
      if (nxt !== i) {
        setFlipped(false);
        setCardKey((k) => k + 1);
      }
      return nxt;
    });
  }
  function goPrev() {
    setIndex((i) => {
      const prv = Math.max(0, i - 1);
      if (prv !== i) {
        setFlipped(false);
        setCardKey((k) => k + 1);
      }
      return prv;
    });
  }

  return (
    <main className="max-w-3xl mx-auto p-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/flashcards" className="text-sm underline text-slate-600">
          ← กลับไปหน้าเลือกบท
        </Link>
        <div className="text-sm text-slate-500">
          {cards.length > 0 ? `${index + 1} / ${cards.length}` : ""}
        </div>
      </div>

      {crossCategoryError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
          {crossCategoryError} — กรุณากลับไปหน้าเลือกบทใหม่
        </div>
      )}

      {loading && <div className="text-slate-500">กำลังโหลด…</div>}
      {!!error && !loading && <div className="text-rose-600">{error}</div>}

      {!loading && !error && !crossCategoryError && cards.length === 0 && (
        <div className="text-slate-500">
          ไม่พบการ์ดที่จะแสดง โปรดกลับไปเลือกบทก่อน
        </div>
      )}

      {!loading && !error && !crossCategoryError && cards.length > 0 && (
        <>
          {/* wrapper แยกชั้นเพื่อไม่ให้ชนกับ rotateY */}
          <div className="scene mb-4">
            <div key={cardKey} className="popWrap animate-pop-in">
              <div
                className={[
                  "card3d",
                  flipped ? "is-flipped" : "",
                  bump ? "is-bump" : "",
                ].join(" ")}
                onClick={smoothFlip}
                title="แตะ/คลิกเพื่อพลิก (กด Space bar ได้)"
                role="button"
                aria-label="flashcard"
              >
                {/* Front */}
                <div className="face face-front border rounded-2xl bg-white p-8 text-center select-none">
                  <div className="text-xs text-slate-400 mb-2">{curr.__title}</div>
                  {isKanji ? (
                    <div className="flex flex-col items-center justify-center">
                      <div className="text-6xl leading-none font-bold">
                        {curr.front || "…"}
                      </div>
                      <div className="mt-3 text-slate-400 text-sm">
                        แตะเพื่อดูคำแปล
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center">
                      {curr.frontTopSmall && (
                        <div className="text-slate-400 text-sm">
                          {curr.frontTopSmall}
                        </div>
                      )}
                      <div className="text-5xl leading-tight font-bold">
                        {curr.frontMainBig}
                      </div>
                      {curr.frontBottomSmall && (
                        <div className="text-slate-400 text-sm mt-2">
                          {curr.frontBottomSmall}
                        </div>
                      )}
                      <div className="mt-3 text-slate-400 text-sm">
                        แตะเพื่อดูคำแปล
                      </div>
                    </div>
                  )}
                </div>

                          {/* Back */}
            <div className="face face-back border rounded-2xl bg-white p-8 text-center select-none">
              <div className="text-xs text-slate-400 mb-2">{curr.__title}</div>
              <div className="flex items-center justify-center h-[130px]">
                <div className="text-6xl leading-none font text-slate-800">
                  {curr.back || "—"}
                </div>
              </div>
            </div>
              </div>
            </div>
          </div>

          {/* ปุ่มควบคุม */}
          <div className="mt-2 flex items-center justify-between">
            <button
              className="rounded-lg border px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
              onClick={goPrev}
              disabled={index === 0}
            >
              ← ก่อนหน้า
            </button>

            <button
              className="rounded-lg border px-3 py-2 hover:bg-slate-50"
              onClick={smoothFlip}
            >
              พลิกการ์ด
            </button>

            <button
              className="rounded-lg border px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
              onClick={goNext}
              disabled={index >= cards.length - 1}
            >
              ต่อไป →
            </button>
          </div>
        </>
      )}

      {/* ------- styles สำหรับ 3D + animations ------- */}
      <style jsx>{`
        .scene { perspective: 1000px; }
        .popWrap { will-change: opacity, transform; }

        .card3d {
          position: relative;
          width: 100%;
          min-height: 260px;
          transform-style: preserve-3d;
          transition:
            transform 420ms cubic-bezier(0.22, 0.61, 0.36, 1),
            translate 180ms ease,
            box-shadow 180ms ease;
          cursor: pointer;
        }
        .card3d.is-bump {
          translate: 0 -6px;
          box-shadow: 0 14px 28px rgba(0,0,0,0.08), 0 8px 12px rgba(0,0,0,0.06);
        }
        .card3d.is-flipped { transform: rotateY(180deg); }

        .face {
          position: absolute;
          inset: 0;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }
        .face-back { transform: rotateY(180deg); }

        @keyframes popIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-pop-in { animation: popIn 240ms ease both; }

        @media (prefers-reduced-motion: reduce) {
          .card3d { transition: none; }
          .animate-pop-in { animation: none; }
        }
      `}</style>
    </main>
  );
}
