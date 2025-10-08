// src/lib/minna-loader.ts
import * as XLSX from "xlsx";

export type Vocab = {
  kanji?: string;       // คันจิ (บางคำอาจไม่มี)
  kana?: string;        // ฮิรางานะ/คาตาคานะ
  romaji?: string;      // โรมาจิ
  meaning?: string;     // ความหมาย (ไทย)
  extra?: string;       // เพิ่มเติม
};

export type LessonData = {
  lesson: number;
  rows: Vocab[];
};

// ช่วย normalize ชื่อหัวตารางที่อาจต่างกันเล็กน้อย
const norm = (s: any) => String(s || "")
  .trim()
  .replace(/\s+/g, " ")
  .toLowerCase();

export async function loadMinnaLesson(lesson: number): Promise<LessonData> {
  const url = `/flashcards/minna_lesson_${lesson}.xlsx`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`โหลดไฟล์ไม่สำเร็จ: ${url}`);
  }
  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  const ws = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

  if (json.length === 0) return { lesson, rows: [] };

  // หาหัวตาราง
  const header = (json[0] || []).map(norm);
  const body = json.slice(1);

  // พยายามแม็พคอลัมน์หลัก ๆ
  const colKanji   = header.findIndex(h => /^(คำศัพท์|kanji|漢字)/.test(h));
  const colKana    = header.findIndex(h => /(อ่านว่า|hiragana|katakana|เรียง|คาตาคานะ|ฮิรางานะ)/.test(h));
  const colMeaning = header.findIndex(h => /(ความหมาย|meaning)/.test(h));
  const colRomaji  = header.findIndex(h => /(romanji|romaji)/.test(h));
  const colExtra   = header.findIndex(h => /(เพิ่มเติม|extra|note)/.test(h));

  const rows: Vocab[] = body
    .map((r) => {
      const get = (i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
      return {
        kanji: get(colKanji) || undefined,
        kana: get(colKana) || undefined,
        romaji: get(colRomaji) || undefined,
        meaning: get(colMeaning) || undefined,
        extra: get(colExtra) || undefined,
      };
    })
    // กรองแถวว่าง
    .filter(v => v.kanji || v.kana || v.meaning || v.romaji || v.extra);

  return { lesson, rows };
}

export async function loadManyLessons(lessons: number[]): Promise<LessonData[]> {
  const uniq = Array.from(new Set(lessons)).sort((a, b) => a - b);
  const data = await Promise.all(uniq.map(l => loadMinnaLesson(l)));
  return data;
}
