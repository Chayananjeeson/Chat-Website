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
  Group?: string; 
  Meaning?: string; 
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
    else if (key === "group" || key === "กลุ่ม") out.Group = String(v || ""); 
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
  
  // State สำหรับควบคุมการเปิด/ปิด Romaji
  const [showRomaji, setShowRomaji] = useState(true);

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

  // ✅ ฟังก์ชัน โหลดไฟล์ Excel รองรับทั้งตาราง Minna และ Kanji
  const handleExportExcel = () => {
    if (!cur || cur.rows.length === 0) {
      alert("ไม่มีข้อมูลสำหรับส่งออก");
      return;
    }

    let exportData: any[] = [];

    if (cur.kind === "minna") {
      exportData = (cur.rows as MinnaRow[]).map(row => ({
        "Kanji": row.Kanji || "",
        "Hiragana/Katakana": row["Hiragana/Katakana"] || "",
        "Romaji": row.Romaji || "",
        "Group": row.Group || "",
        "Meaning": row.Meaning || ""
      }));
    } else if (cur.kind === "kanji") {
      exportData = (cur.rows as KanjiRow[]).map(row => ({
        "Kanji": row.Kanji || "",
        "ความหมาย (TH)": row.MeaningTH || "",
        "Onyomi (JP)": row.OnyomiJP || "",
        "Onyomi (Romaji)": row.OnyomiRomaji || "",
        "Kunyomi (JP)": row.KunyomiJP || "",
        "Kunyomi (Romaji)": row.KunyomiRomaji || "",
        "Vocabulary (JP)": row.VocabJP || "",
        "Vocabulary (Romaji)": row.VocabRomaji || "",
        "ความหมาย Vocab (TH)": row.VocabTH || ""
      }));
    }

    // สร้างไฟล์ Excel
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Flashcards");

    // ตั้งชื่อไฟล์ตามชื่อ Section (เช่น Minna_no_Nihongo_-_บท_1_data.xlsx)
    const fileName = `${cur.title.replace(/\s+/g, '_')}_data.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <main className="max-w-6xl mx-auto p-6">
      <div className="mb-4">
        <Link href="/flashcards" className="text-sm underline text-slate-600">
          ← กลับไปหน้าเลือกบท
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${isKanjiMode ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700"}`}>
            {isKanjiMode ? "KANJI" : "MINNA"}
          </span>
          ตารางคำศัพท์ / คันจิ
        </h1>

        <div className="flex flex-wrap items-center gap-3">
          {/* Checkbox ซ่อน/แสดง Romaji (โชว์เฉพาะโหมด Minna) */}
          {!isKanjiMode && !loading && sections.length > 0 && (
            <label className="flex items-center gap-2 text-sm font-bold text-slate-600 cursor-pointer bg-white px-4 py-2 rounded-lg border shadow-sm hover:bg-slate-50 transition-colors w-fit">
              <input 
                type="checkbox" 
                checked={showRomaji} 
                onChange={e => setShowRomaji(e.target.checked)} 
                className="w-4 h-4 accent-sky-600 cursor-pointer" 
              />
              แสดง Romaji
            </label>
          )}

          {/* ✅ ปุ่มโหลด Excel */}
          {!loading && sections.length > 0 && (
            <button 
              onClick={handleExportExcel}
              className="flex items-center gap-2 text-sm font-bold text-white bg-emerald-500 px-4 py-2 rounded-lg shadow-sm hover:bg-emerald-600 transition-colors w-fit"
            >
              📥 โหลดเป็น Excel
            </button>
          )}
        </div>
      </div>

      {!loading && !error && sections.length > 0 && (
        <>
          <div className="mb-3 flex items-center gap-2">
            <div className="flex overflow-x-auto gap-2 pr-2 pb-2 md:pb-0">
              {sections.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => setCurrent(idx)}
                  className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${idx === current ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-white hover:bg-slate-50 text-slate-600"}`}
                >
                  {s.title}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <button onClick={onPrev} disabled={current <= 0} className="rounded-lg border bg-white px-3 py-1.5 text-sm disabled:opacity-30 shadow-sm">←</button>
              <span className="text-xs font-mono">{current + 1} / {sections.length}</span>
              <button onClick={onNext} disabled={current >= sections.length - 1} className="rounded-lg border bg-white px-3 py-1.5 text-sm disabled:opacity-30 shadow-sm">→</button>
            </div>
          </div>

          {cur?.kind === "minna" && (
            <div className="overflow-x-auto border rounded-xl bg-white shadow-sm w-full">
              <table className="min-w-full text-sm w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold min-w-[120px] w-[15%] whitespace-nowrap">Kanji</th>
                    <th className="px-4 py-3 text-left font-semibold min-w-[120px] w-[15%] whitespace-nowrap">Hiragana/Katakana</th>
                    {showRomaji && <th className="px-4 py-3 text-left font-semibold min-w-[120px] w-[15%] whitespace-nowrap">Romaji</th>}
                    <th className="px-4 py-3 text-center font-semibold w-[80px] whitespace-nowrap">Group</th>
                    <th className="px-4 py-3 text-left font-semibold w-auto">ความหมาย</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cur.rows.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-900 text-[15px] break-keep">{r.Kanji || "-"}</td>
                      <td className="px-4 py-3 text-slate-600 text-[15px] break-keep">{r["Hiragana/Katakana"] || "-"}</td>
                      {showRomaji && <td className="px-4 py-3 text-slate-500 italic break-keep">{r.Romaji || "-"}</td>}
                      <td className="px-4 py-3 text-center whitespace-nowrap">
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
            <div className="overflow-x-auto border rounded-xl bg-white shadow-sm w-full">
              <table className="min-w-full text-sm w-full">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left min-w-[100px] w-[15%] whitespace-nowrap">Kanji</th>
                    <th className="px-4 py-3 text-left min-w-[200px] w-[25%] whitespace-nowrap">ความหมาย (TH)</th>
                    <th className="px-4 py-3 text-left min-w-[200px] w-[30%]">Onyomi / Kunyomi</th>
                    <th className="px-4 py-3 text-left min-w-[200px] w-[30%]">Vocabulary (JP / TH)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(cur.rows as KanjiRow[]).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-4 py-4 align-top text-3xl font-bold break-keep">{r.Kanji || "-"}</td>
                      <td className="px-4 py-4 align-top text-slate-700">{r.MeaningTH || "-"}</td>
                      <td className="px-4 py-4 align-top text-xs space-y-1">
                        <div><span className="text-rose-500 font-bold">On:</span> {r.OnyomiJP} {r.OnyomiRomaji ? `(${r.OnyomiRomaji})` : ""}</div>
                        <div className="mt-1"><span className="text-sky-500 font-bold">Kun:</span> {r.KunyomiJP} {r.KunyomiRomaji ? `(${r.KunyomiRomaji})` : ""}</div>
                      </td>
                      <td className="px-4 py-4 align-top text-xs">
                        <div className="font-bold text-slate-800 break-keep">{r.VocabJP} {r.VocabRomaji ? `(${r.VocabRomaji})` : ""}</div>
                        <div className="text-slate-500 mt-1">{r.VocabTH}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {loading && <div className="py-20 text-center text-slate-400 font-medium animate-pulse">กำลังโหลดข้อมูล...</div>}
      {error && <div className="py-20 text-center text-rose-500 font-bold bg-rose-50 rounded-xl border border-rose-200 mt-4">{error}</div>}
    </main>
  );
}