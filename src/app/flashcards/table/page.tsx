"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as XLSX from "xlsx";

/* ===================== Types ===================== */
type MinnaRow = {
  Kanji?: string;
  "Hiragana/Katakana"?: string;
  Romaji?: string;
  Meaning?: string; // TH
};

type KanjiRow = {
  Kanji?: string;
  MeaningTH?: string;          // ความหมายคันจิ
  OnyomiJP?: string;
  OnyomiRomaji?: string;
  KunyomiJP?: string;
  KunyomiRomaji?: string;
  VocabJP?: string;
  VocabRomaji?: string;
  VocabTH?: string;            // ความหมาย vocab
};

type Section =
  | { kind: "minna"; id: string; title: string; rows: MinnaRow[] }
  | { kind: "kanji"; id: string; title: string; rows: KanjiRow[] };

/* ===================== Helpers ===================== */
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

function normalizeMinnaRow(r: any): MinnaRow {
  const out: MinnaRow = {};
  Object.entries(r).forEach(([k, v]) => {
    const key = String(k).trim().toLowerCase();
    if (key === "kanji") out.Kanji = String(v || "");
    else if (key.includes("hiragana") || key.includes("katakana"))
      out["Hiragana/Katakana"] = String(v || "");
    else if (key.includes("romaji")) out.Romaji = String(v || "");
    else if (key.includes("meaning") || key.includes("ความหมาย"))
      out.Meaning = String(v || "");
  });
  return out;
}

function normalizeKanjiRow(r: any): KanjiRow {
  const map: Record<string, keyof KanjiRow> = {
    kanji: "Kanji",
    "meaning (th)": "MeaningTH",
    ความหมาย: "MeaningTH",
    "onyomi (jp)": "OnyomiJP",
    "onyomi (romaji)": "OnyomiRomaji",
    "kunyomi (jp)": "KunyomiJP",
    "kunyomi (romaji)": "KunyomiRomaji",
    "vocabulary (jp)": "VocabJP",
    "vocabulary (romaji)": "VocabRomaji",
    "vocabulary (th)": "VocabTH",
  };
  const out: KanjiRow = {};
  Object.entries(r).forEach(([k, v]) => {
    const key = String(k).trim().toLowerCase();
    const mapped = map[key];
    if (mapped) (out as any)[mapped] = String(v || "");
  });
  return out;
}

/* ===================== Page ===================== */
export default function FlashcardTablePage() {
  const sp = useSearchParams();

  // จากหน้าเลือกบท: lessons="1,2" | kanji="n5" (หรือหลายระดับ "n5,n4")
  const lessonsParam = (sp.get("lessons") || "").trim();
  const kanjiParam = (sp.get("kanji") || "").trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [current, setCurrent] = useState(0);

  const isKanjiMode = useMemo(() => !!kanjiParam && !lessonsParam, [kanjiParam, lessonsParam]);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setError("");
        const built: Section[] = [];

        if (isKanjiMode) {
          const levels = kanjiParam
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

          for (const lv of levels) {
            const file = `/flashcards/jlpt_${lv}_kanji.xlsx`; // public/flashcards/jlpt_n5_kanji.xlsx
            const raw = await fetchXlsxOnce(file);
            const rows = raw.map(normalizeKanjiRow);
            built.push({
              kind: "kanji",
              id: `kanji-${lv}`,
              title: `JLPT ${lv.toUpperCase()}`,
              rows,
            });
          }
        } else {
          const lessons = lessonsParam
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .map(normalizeLessonId);

          for (const L of lessons) {
            const file = `/flashcards/minna_lesson_${L}.xlsx`;
            const raw = await fetchXlsxOnce(file);
            const rows = raw.map(normalizeMinnaRow);
            built.push({
              kind: "minna",
              id: `minna-${L}`,
              title: `Minna no Nihongo – บท ${L}`,
              rows,
            });
          }
        }

        setSections(built);
        setCurrent(0);
      } catch (e: any) {
        setError(e?.message || "เกิดข้อผิดพลาดในการโหลดไฟล์");
        setSections([]);
        setCurrent(0);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [isKanjiMode, lessonsParam, kanjiParam]);

  const badge = isKanjiMode ? (
    <span className="inline-block text-[10px] font-semibold tracking-wide px-2 py-1 rounded-full bg-rose-100 text-rose-700">
      KANJI
    </span>
  ) : (
    <span className="inline-block text-[10px] font-semibold tracking-wide px-2 py-1 rounded-full bg-sky-100 text-sky-700">
      MINNA
    </span>
  );

  const onPrev = () => setCurrent((i) => Math.max(0, i - 1));
  const onNext = () => setCurrent((i) => Math.min(sections.length - 1, i + 1));

  const cur = sections[current];

  return (
    <main className="max-w-5xl mx-auto p-6">
      <div className="mb-4">
        <Link href="/flashcards" className="text-sm underline text-slate-600">
          ← กลับไปหน้าเลือกบท
        </Link>
      </div>

      <h1 className="text-2xl font-semibold mb-2 flex items-center gap-2">
        {badge}
        ตารางคำศัพท์ / คันจิ
      </h1>
      <p className="text-sm text-slate-500 mb-4">
        จะแสดงเฉพาะรายการที่คุณเลือกไว้จากหน้าก่อนหน้า คุณสามารถสลับระหว่างรายการที่เลือกด้วยแท็บหรือปุ่มลูกศร
      </p>

      {loading && <div className="text-slate-500">กำลังโหลด…</div>}
      {!!error && <div className="text-rose-600">{error}</div>}

      {!loading && !error && sections.length > 0 && (
        <>
          {/* Nav bar: tabs + arrows */}
          <div className="mb-3 flex items-center gap-2">
            <div className="flex overflow-x-auto gap-2 pr-2">
              {sections.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => setCurrent(idx)}
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm ${
                    idx === current ? "bg-slate-900 text-white border-slate-900" : "hover:bg-slate-50"
                  }`}
                  title={s.title}
                >
                  {s.title}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={onPrev}
                disabled={current <= 0}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  current <= 0 ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50"
                }`}
                title="ก่อนหน้า"
              >
                ← ก่อนหน้า
              </button>
              <div className="text-xs text-slate-500">{current + 1} / {sections.length}</div>
              <button
                onClick={onNext}
                disabled={current >= sections.length - 1}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  current >= sections.length - 1 ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-50"
                }`}
                title="ถัดไป"
              >
                ถัดไป →
              </button>
            </div>
          </div>

          {/* Current section title bar */}
          <div className="px-3 py-2 mb-2 border rounded-lg bg-white flex items-center gap-2">
            {badge}
            <div className="font-medium">{cur?.title}</div>
          </div>

          {/* Render table by section type */}
          {cur?.kind === "minna" && (
            <section className="overflow-x-auto border rounded-xl bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left">Kanji</th>
                    <th className="px-3 py-2 text-left">Hiragana/Katakana</th>
                    <th className="px-3 py-2 text-left">Romaji</th>
                    <th className="px-3 py-2 text-left w-[260px]">ความหมาย</th>
                  </tr>
                </thead>
                <tbody>
                  {cur.rows.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">{r.Kanji}</td>
                      <td className="px-3 py-2">{r["Hiragana/Katakana"]}</td>
                      <td className="px-3 py-2">{r.Romaji}</td>
                      <td className="px-3 py-2">{r.Meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {cur?.kind === "kanji" && (
            <section className="overflow-x-auto border rounded-xl bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-700">
                  <tr>
                    <th className="px-3 py-2 text-left w-[120px]">Kanji</th>
                    <th className="px-3 py-2 text-left w-[220px]">ความหมายคันจิ (TH)</th>
                    <th className="px-3 py-2 text-left">Onyomi (JP / Romaji)</th>
                    <th className="px-3 py-2 text-left">Kunyomi (JP / Romaji)</th>
                    <th className="px-3 py-2 text-left">Vocabulary (JP / Romaji)</th>
                    <th className="px-3 py-2 text-left w-[220px]">ความหมาย Vocab (TH)</th>
                  </tr>
                </thead>
                <tbody>
                  {(cur.rows as KanjiRow[]).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-3 align-top">
                        <div className="text-3xl leading-none">{r.Kanji || "-"}</div>
                      </td>
                      <td className="px-3 py-3 align-top whitespace-pre-wrap">{r.MeaningTH || ""}</td>
                      <td className="px-3 py-3 align-top whitespace-pre-wrap">
                        {r.OnyomiJP || ""}{r.OnyomiJP && r.OnyomiRomaji ? " / " : ""}{r.OnyomiRomaji || ""}
                      </td>
                      <td className="px-3 py-3 align-top whitespace-pre-wrap">
                        {r.KunyomiJP || ""}{r.KunyomiJP && r.KunyomiRomaji ? " / " : ""}{r.KunyomiRomaji || ""}
                      </td>
                      <td className="px-3 py-3 align-top whitespace-pre-wrap">
                        {r.VocabJP || ""}{r.VocabJP && r.VocabRomaji ? " / " : ""}{r.VocabRomaji || ""}
                      </td>
                      <td className="px-3 py-3 align-top whitespace-pre-wrap">{r.VocabTH || ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      )}

      {!loading && !error && sections.length === 0 && (
        <div className="text-slate-500">ยังไม่ได้เลือกบทหรือไฟล์ไม่พบ</div>
      )}
    </main>
  );
}
