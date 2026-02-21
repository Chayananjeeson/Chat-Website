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
  Group?: string; 
};

type KanjiRow = {
  Kanji?: string;
  Meaning?: string;
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
    group: "Group", 
    กลุ่ม: "Group",
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

export default function FlashcardsPlayPage() {
  const sp = useSearchParams();

  const mode = sp.get("mode");
  const isCustom = mode === "custom";

  const kanjiParam = sp.get("kanji");
  const lessonsParam = sp.get("lessons");
  const isKanji = !!kanjiParam;

  const showJa = sp.get("showJa") === "1";
  const showRo = sp.get("showRo") === "1";
  const hideKanaIfHasKanji = sp.get("hideKanaIfHasKanji") === "1";
  const wantShuffle = sp.get("shuffle") === "1";
  const onlyVerbs = sp.get("onlyVerbs") === "1"; // ดึงพารามิเตอร์คัดเฉพาะคำกริยา

  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const [bump, setBump] = useState(false);
  const [cardKey, setCardKey] = useState(0);

  const crossCategoryError = useMemo(() => {
    // ป้องกันการเลือกข้ามหมวดหมู่
    const activeModes = [!!kanjiParam, !!lessonsParam, isCustom].filter(Boolean).length;
    if (activeModes > 1) {
      return "กรุณาเลือกอย่างใดอย่างหนึ่งระหว่าง Custom, Kanji หรือ Minna (ห้ามเลือกข้ามหมวด)";
    }
    return "";
  }, [kanjiParam, lessonsParam, isCustom]);

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

        // ==========================
        // 1. โหมด Custom Data Sets
        // ==========================
        if (isCustom) {
          const rawData = sessionStorage.getItem("play_custom_data") || "";
          if (!rawData) {
            throw new Error("ไม่พบข้อมูลชุดคำศัพท์ (Session ว่างเปล่า)");
          }

          // แยกทีละบรรทัด (ตัดบรรทัดที่เป็น --- ทิ้งไป)
          const lines = rawData.split("\n").map(l => l.trim()).filter(l => l && l !== "---");

          let items = lines.map((line) => {
            const parts = line.split("|").map(p => p.trim());
            const kanji = parts[0] || "";
            const kana = parts[1] || "";
            const romaji = parts[2] || "";
            const group = parts[3] || "";
            const meaning = parts[4] || "";

            const hasKanji = !!kanji && kanji !== "-" && /[一-龯々〆ヵヶ]/.test(kanji);

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
              type: "custom",
              frontTopSmall,
              frontMainBig,
              frontBottomSmall,
              back: meaning,
              group, 
            };
          });

          // Logic กรองเฉพาะคำกริยา
          if (onlyVerbs) {
            items = items.filter(it => it.group && it.group.trim() !== "" && it.group !== "-");
          }

          if (items.length > 0) {
            list.push({ title: `Custom Flashcards`, items });
          }
        } 
        
        // ==========================
        // 2. โหมด JLPT Kanji (ระบบเดิม)
        // ==========================
        else if (isKanji) {
          const levels = kanjiParam!
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

          for (const lv of levels) {
            const raw: KanjiRow[] = await fetchXlsxOnce(`/flashcards/jlpt_${lv}_kanji.xlsx`);
            const rows = raw.map((r) => normalizeKeys<KanjiRow>(r));
            const items = rows
              .filter((r) => (r.Kanji || "").toString().trim() || (r.Meaning || "").toString().trim())
              .map((r) => ({
                type: "kanji",
                front: (r.Kanji || "").toString(),
                back: (r.Meaning || "").toString(),
              }));
            list.push({ title: `JLPT ${lv.toUpperCase()}`, items });
          }
        } 
        
        // ==========================
        // 3. โหมด Minna no Nihongo (ระบบเดิม)
        // ==========================
        else if (lessonsParam) {
          const lessons = lessonsParam
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map(normalizeLessonId);

          for (const L of lessons) {
            const raw: MinnaRow[] = await fetchXlsxOnce(`/flashcards/minna_lesson_${L}.xlsx`);
            const rows = raw.map((r) => normalizeKeys<MinnaRow>(r));

            let items = rows.map((r) => {
              const kana = (r["Hiragana/Katakana"] || "").toString();
              const kanji = (r.Kanji || "").toString();
              const romaji = (r.Romaji || "").toString();
              const meaning = (r.Meaning || "").toString();
              const group = (r.Group || "").toString();

              const hasKanji = !!kanji && kanji !== "-" && /[一-龯々〆ヵヶ]/.test(kanji);

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
                group, 
              };
            });

            // Logic กรองเฉพาะคำกริยา
            if (onlyVerbs) {
              items = items.filter(it => it.group && it.group.trim() !== "" && it.group !== "-");
            }

            if (items.length > 0) {
              list.push({ title: `Minna no Nihongo – บท ${L}`, items });
            }
          }
        }

        // ==========================
        // นำ List ทั้งหมดมารวม และสุ่ม
        // ==========================
        const merged: any[] = [];
        list.forEach((sec) => {
          sec.items.forEach((it: any) => merged.push({ ...it, __title: sec.title }));
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
  }, [kanjiParam, lessonsParam, isCustom, showJa, showRo, hideKanaIfHasKanji, wantShuffle, onlyVerbs, crossCategoryError]);

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
        <div className="text-sm text-slate-500 font-mono">
          {cards.length > 0 ? `${index + 1} / ${cards.length}` : ""}
        </div>
      </div>

      {crossCategoryError && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
          {crossCategoryError} — กรุณากลับไปหน้าเลือกบทใหม่
        </div>
      )}

      {loading && <div className="text-slate-500 text-center py-10">กำลังโหลด…</div>}
      {!!error && !loading && <div className="text-rose-600 text-center py-10">{error}</div>}

      {!loading && !error && !crossCategoryError && cards.length === 0 && (
        <div className="text-slate-500 text-center py-10 border-2 border-dashed rounded-2xl">
          ไม่พบข้อมูลที่ตรงตามเงื่อนไข (อาจไม่มีคำกริยาในบทที่เลือก) <br/> โปรดกลับไปเลือกบทใหม่
        </div>
      )}

      {!loading && !error && !crossCategoryError && cards.length > 0 && (
        <>
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
                <div className="face face-front border rounded-2xl bg-white p-8 text-center select-none shadow-sm relative overflow-hidden">
                  {curr.group && (
                    <div className="absolute top-3 right-3 px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-black rounded uppercase border border-amber-200">
                      Group {curr.group}
                    </div>
                  )}
                  
                  <div className="text-xs text-slate-400 mb-2">{curr.__title}</div>
                  <div className="flex flex-col items-center justify-center">
                    {curr.frontTopSmall && (
                      <div className="text-slate-400 text-lg mb-1">
                        {curr.frontTopSmall}
                      </div>
                    )}
                    <div className={isKanji ? "text-7xl font-bold" : "text-6xl leading-tight font-bold"}>
                      {isKanji ? (curr.front || "…") : curr.frontMainBig}
                    </div>
                    {curr.frontBottomSmall && (
                      <div className="text-slate-400 text-lg mt-2 font-mono">
                        {curr.frontBottomSmall}
                      </div>
                    )}
                    <div className="mt-8 text-slate-300 text-sm italic">
                      แตะเพื่อดูคำแปล
                    </div>
                  </div>
                </div>

                {/* Back */}
                <div className="face face-back border rounded-2xl bg-white p-8 text-center select-none shadow-sm relative overflow-hidden">
                   {curr.group && (
                    <div className="absolute top-3 right-3 px-2 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-black rounded uppercase border border-blue-100">
                      Group {curr.group}
                    </div>
                  )}
                  <div className="text-xs text-slate-400 mb-2">{curr.__title}</div>
                  <div className="flex items-center justify-center h-full min-h-[130px]">
                    <div className="text-4xl md:text-5xl font-bold text-slate-800">
                      {curr.back || "—"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4">
            <button
              className="flex-1 rounded-xl border-2 border-slate-200 px-3 py-4 hover:bg-slate-50 disabled:opacity-30 transition-all active:bg-slate-100 font-bold text-slate-600"
              onClick={goPrev}
              disabled={index === 0}
            >
              ← ก่อนหน้า
            </button>
            <button
              className="flex-1 rounded-xl border-2 border-slate-200 px-3 py-4 bg-slate-50 hover:bg-slate-100 transition-all active:bg-slate-200 font-black text-slate-700 shadow-sm"
              onClick={smoothFlip}
            >
              พลิกการ์ด
            </button>
            <button
              className="flex-1 rounded-xl border-2 border-blue-600 px-3 py-4 hover:bg-blue-50 transition-all active:bg-blue-100 text-blue-600 font-black disabled:opacity-30 disabled:border-slate-200"
              onClick={goNext}
              disabled={index >= cards.length - 1}
            >
              ต่อไป →
            </button>
          </div>
        </>
      )}

      <style jsx>{`
        .scene { perspective: 1200px; }
        .popWrap { will-change: opacity, transform; }
        .card3d {
          position: relative;
          width: 100%;
          min-height: 320px;
          transform-style: preserve-3d;
          transition: transform 500ms cubic-bezier(0.175, 0.885, 0.32, 1.275), translate 180ms ease, box-shadow 180ms ease;
          cursor: pointer;
        }
        .card3d.is-bump { translate: 0 -8px; }
        .card3d.is-flipped { transform: rotateY(180deg); }
        .face {
          position: absolute;
          inset: 0;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .face-back { transform: rotateY(180deg); }
        @keyframes popIn {
          from { opacity: 0; transform: translateY(15px) scale(0.95); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-pop-in { animation: popIn 300ms ease-out both; }
      `}</style>
    </main>
  );
}