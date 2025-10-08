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

/** ทำให้ชื่อคอลัมน์จาก Excel กลายเป็น key มาตรฐานที่เราคาดไว้ */
function normalizeKeys<T extends object>(row: any): T {
  const map: Record<string, string> = {
    // common
    kanji: "Kanji",
    romaji: "Romaji",
    "hiragana/katakana": "Hiragana/Katakana",
    hiragana: "Hiragana/Katakana",
    katakana: "Hiragana/Katakana",

    // meaning
    meaning: "Meaning",
    "meaning (th)": "Meaning",
    ความหมาย: "Meaning",
    "vocabulary (th)": "Vocabulary (TH)",

    // kanji detail (เผื่ออนาคต)
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

  // โหมด
  const kanjiParam = sp.get("kanji");     // เช่น "n5" หรือ "n5,n4"
  const lessonsParam = sp.get("lessons"); // เช่น "1,2"
  const isKanji = !!kanjiParam;

  // ตัวเลือก (เฉพาะ Minna)
  const showJa = sp.get("showJa") === "1";
  const showRo = sp.get("showRo") === "1";
  const hideKanaIfHasKanji = sp.get("hideKanaIfHasKanji") === "1";

  // ทั่วไป
  const wantShuffle = sp.get("shuffle") === "1";

  // ข้อมูลการ์ด
  const [cards, setCards] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // การเล่น
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // ป้องกันเลือกข้ามหมวด (กันเผื่อมีการแก้ URL เอง)
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
            let raw: KanjiRow[] = [];
            try {
              raw = await fetchXlsxOnce(`/kanji/jlpt_${lv}_kanji.xlsx`);
            } catch {
              raw = await fetchXlsxOnce(`/flashcards/jlpt_${lv}_kanji.xlsx`);
            }

            // **สำคัญ**: normalize ชื่อคอลัมน์ก่อนใช้
            const rows = raw.map((r) => normalizeKeys<KanjiRow>(r));

            const items = rows
              .filter((r) => (r.Kanji || "").toString().trim() || (r.Meaning || "").toString().trim())
              .map((r) => ({
                type: "kanji",
                front: (r.Kanji || "").toString(),
                back: (r.Meaning || "").toString(), // มาจาก "Meaning (TH)" ที่ถูก normalize แล้ว
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
            const raw: MinnaRow[] = await fetchXlsxOnce(`/flashcards/minna_lesson_${L}.xlsx`);
            const rows = raw.map((r) => normalizeKeys<MinnaRow>(r));

            const items = rows.map((r) => {
              const kana = (r["Hiragana/Katakana"] || "").toString();
              const kanji = (r.Kanji || "").toString();
              const romaji = (r.Romaji || "").toString();
              const meaning = (r.Meaning || "").toString();

              const hasKanji = !!kanji && kanji !== "-" && /[一-龯々〆ヵヶ]/.test(kanji);

              // ด้านหน้า (front)
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
                frontMainBig = (showRo && romaji) ? romaji : (kana || kanji || "…");
              }

              return {
                type: "minna",
                frontTopSmall,
                frontMainBig,
                frontBottomSmall,
                back: meaning, // มาจาก "ความหมาย" ที่ถูก normalize เป็น Meaning แล้ว
              };
            });

            list.push({ title: `Minna no Nihongo – บท ${L}`, items });
          }
        }

        const merged: any[] = [];
        list.forEach((sec) => {
          sec.items.forEach((it: any) => merged.push({ ...it, __title: sec.title }));
        });

        const final = wantShuffle ? shuffleArray(merged) : merged;

        setCards(final);
        setIndex(0);
        setFlipped(false);
      } catch (e: any) {
        setError(e?.message || "เกิดข้อผิดพลาดในการโหลดไฟล์");
        setCards([]);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [kanjiParam, lessonsParam, showJa, showRo, hideKanaIfHasKanji, wantShuffle, crossCategoryError]);

  // คีย์ลัด
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.key === "ArrowRight") {
        setIndex((i) => Math.min(cards.length - 1, i + 1));
        setFlipped(false);
      } else if (e.key === "ArrowLeft") {
        setIndex((i) => Math.max(0, i - 1));
        setFlipped(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cards.length]);

  const curr = cards[index];

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
        <div className="text-slate-500">ไม่พบการ์ดที่จะแสดง โปรดกลับไปเลือกบทก่อน</div>
      )}

      {!loading && !error && !crossCategoryError && cards.length > 0 && (
        <>
          {/* การ์ด */}
          <div
            className="border rounded-2xl bg-white p-8 text-center cursor-pointer select-none"
            style={{ minHeight: 220 }}
            onClick={() => setFlipped((f) => !f)}
            title="คลิกเพื่อพลิกการ์ด (กด Space bar ได้)"
          >
            <div className="text-xs text-slate-400 mb-2">{curr.__title}</div>

            {!flipped ? (
              isKanji ? (
                <div className="flex flex-col items-center justify-center">
                  <div className="text-6xl leading-none font-bold">{curr.front || "…"}</div>
                  <div className="mt-3 text-slate-400 text-sm">คลิกเพื่อดูคำแปล</div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center">
                  {curr.frontTopSmall && (
                    <div className="text-slate-400 text-sm">{curr.frontTopSmall}</div>
                  )}
                  <div className="text-5xl leading-tight font-bold">{curr.frontMainBig}</div>
                  {curr.frontBottomSmall && (
                    <div className="text-slate-400 text-sm mt-2">{curr.frontBottomSmall}</div>
                  )}
                  <div className="mt-3 text-slate-400 text-sm">คลิกเพื่อดูคำแปล</div>
                </div>
              )
           ) : (
  <div className="flex flex-col justify-center items-center h-[220px]">
    <div className="text-4xl font text-slate-800">{curr.back || "—"}</div>
  </div>
)
}
          </div>

          {/* ปุ่มควบคุม */}
          <div className="mt-4 flex items-center justify-between">
            <button
              className="rounded-lg border px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => {
                setIndex((i) => Math.max(0, i - 1));
                setFlipped(false);
              }}
              disabled={index === 0}
            >
              ← ก่อนหน้า
            </button>

            <button
              className="rounded-lg border px-3 py-2 hover:bg-slate-50"
              onClick={() => setFlipped((f) => !f)}
            >
              พลิกการ์ด
            </button>

            <button
              className="rounded-lg border px-3 py-2 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => {
                setIndex((i) => Math.min(cards.length - 1, i + 1));
                setFlipped(false);
              }}
              disabled={index >= cards.length - 1}
            >
              ต่อไป →
            </button>
          </div>
        </>
      )}
    </main>
  );
}
