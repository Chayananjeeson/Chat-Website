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
  Group?: string; // เพิ่ม Group
  Meaning?: string; // TH
};

type KanjiRow = {
  Kanji?: string;
  MeaningTH?: string;
  OnyomiJP?: string;
  OnyomiRomaji?: string;
  KunyomiJP?: string;
  KunyomiRomaji?: string;
  VocabJP?: string;
  VocabRomaji?: string;
  VocabTH?: string;
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
    else if (key === "group" || key === "กลุ่ม") out.Group = String(v || ""); // เพิ่มการอ่านค่า Group
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
          const levels = kanjiParam.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
          for (const lv of levels) {
            const raw = await fetchXlsxOnce(`/flashcards/jlpt_${lv}_kanji.xlsx`);
            const rows = raw.map(normalizeKanjiRow);
            built.push({ kind: "kanji", id: `kanji-${lv}`, title: `JLPT ${lv.toUpperCase()}`, rows });
          }
        } else {
          const lessons = lessonsParam.split(",").map((s) => s.trim()).filter(Boolean).map(normalizeLessonId);
          for (const L of lessons) {
            const raw = await fetchXlsxOnce(`/flashcards/minna_lesson_${L}.xlsx`);
            const rows = raw.map(normalizeMinnaRow);
            built.push({ kind: "minna", id: `minna-${L}`, title: `Minna no Nihongo – บท ${L}`, rows });
          }
        }

        setSections(built);
        setCurrent(0);
      } catch (e: any) {
        setError(e?.message || "เกิดข้อผิดพลาดในการโหลดไฟล์");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [isKanjiMode, lessonsParam, kanjiParam]);

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
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${isKanjiMode ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700"}`}>
          {isKanjiMode ? "KANJI" : "MINNA"}
        </span>
        ตารางคำศัพท์ / คันจิ
      </h1>

      {!loading && !error && sections.length > 0 && (
        <>
          <div className="mb-3 flex items-center gap-2">
            <div className="flex overflow-x-auto gap-2 pr-2">
              {sections.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => setCurrent(idx)}
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-sm ${idx === current ? "bg-slate-900 text-white" : "hover:bg-slate-50"}`}
                >
                  {s.title}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <button onClick={onPrev} disabled={current <= 0} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-30">←</button>
              <span className="text-xs">{current + 1} / {sections.length}</span>
              <button onClick={onNext} disabled={current >= sections.length - 1} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-30">→</button>
            </div>
          </div>

          {cur?.kind === "minna" && (
            <div className="overflow-x-auto border rounded-xl bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Kanji</th>
                    <th className="px-4 py-3 text-left font-semibold">Hiragana/Katakana</th>
                    <th className="px-4 py-3 text-left font-semibold">Romaji</th>
                    <th className="px-4 py-3 text-center font-semibold">Group</th>
                    <th className="px-4 py-3 text-left font-semibold w-[300px]">ความหมาย</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cur.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900">{r.Kanji}</td>
                      <td className="px-4 py-3 text-slate-600">{r["Hiragana/Katakana"]}</td>
                      <td className="px-4 py-3 text-slate-500 italic">{r.Romaji}</td>
                      <td className="px-4 py-3 text-center">
                        {r.Group && (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-bold">
                            {r.Group}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{r.Meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {cur?.kind === "kanji" && (
            <div className="overflow-x-auto border rounded-xl bg-white shadow-sm">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left">Kanji</th>
                    <th className="px-4 py-3 text-left">ความหมาย (TH)</th>
                    <th className="px-4 py-3 text-left">Onyomi / Kunyomi</th>
                    <th className="px-4 py-3 text-left">Vocabulary (JP / TH)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(cur.rows as KanjiRow[]).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-4 py-4 align-top text-3xl">{r.Kanji}</td>
                      <td className="px-4 py-4 align-top">{r.MeaningTH}</td>
                      <td className="px-4 py-4 align-top text-xs space-y-1">
                        <div><span className="text-rose-500 font-bold">On:</span> {r.OnyomiJP} ({r.OnyomiRomaji})</div>
                        <div><span className="text-sky-500 font-bold">Kun:</span> {r.KunyomiJP} ({r.KunyomiRomaji})</div>
                      </td>
                      <td className="px-4 py-4 align-top text-xs">
                        <div className="font-bold text-slate-800">{r.VocabJP} ({r.VocabRomaji})</div>
                        <div className="text-slate-500">{r.VocabTH}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {loading && <div className="py-10 text-center text-slate-400">กำลังโหลดข้อมูล...</div>}
      {error && <div className="py-10 text-center text-rose-500">{error}</div>}
    </main>
  );
}