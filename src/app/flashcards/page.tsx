"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/** รายการเลเวลคันจิ */
const KANJI_LEVELS = [
  { id: "n5", label: "Kanji – N5" },
  { id: "n4", label: "Kanji – N4" },
  { id: "n3", label: "Kanji – N3" },
  { id: "n2", label: "Kanji – N2" },
  { id: "n1", label: "Kanji – N1" },
];

/** รายการบท Minna (เพิ่มได้ภายหลัง) */
const MINNA_LESSONS = [
  { id: "1", label: "Minna no Nihongo – บท 1" },
  { id: "2", label: "Minna no Nihongo – บท 2" },
];

export default function FlashcardsChooser() {
  const router = useRouter();

  // เลือกบทย่อย ๆ
  const [selectedKanji, setSelectedKanji] = useState<string[]>([]);
  const [selectedLessons, setSelectedLessons] = useState<string[]>([]);

  // ตัวเลือกแสดงผล
  const [showJapanese, setShowJapanese] = useState(true);
  const [showRomaji, setShowRomaji] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [hideKanaIfHasKanji, setHideKanaIfHasKanji] = useState(false); // ใหม่

  // ========== บังคับเลือกได้ทีละ "หมวด" ==========
  const toggleKanji = (id: string) => {
    // ถ้ามีเลือก Minna อยู่แล้ว ห้ามเลือก Kanji
    if (selectedLessons.length > 0 && !selectedKanji.includes(id)) {
      alert("คุณเลือกหมวด Minna อยู่แล้ว กรุณายกเลิก Minna ก่อน เพื่อเลือก Kanji");
      return;
    }
    setSelectedKanji((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleLesson = (id: string) => {
    // ถ้ามีเลือก Kanji อยู่แล้ว ห้ามเลือก Minna
    if (selectedKanji.length > 0 && !selectedLessons.includes(id)) {
      alert("คุณเลือกหมวด Kanji อยู่แล้ว กรุณายกเลิก Kanji ก่อน เพื่อเลือก Minna");
      return;
    }
    setSelectedLessons((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // ปุ่ม “เริ่มเรียน” -> ไปหน้าเล่นแฟลชการ์ด
  const onStart = () => {
    if (selectedKanji.length === 0 && selectedLessons.length === 0) {
      alert("กรุณาเลือกอย่างน้อยหนึ่งบท/ระดับก่อน");
      return;
    }

    // ถ้าเป็น Kanji
    if (selectedKanji.length > 0) {
      const p = new URLSearchParams();
      p.set("kanji", selectedKanji.join(",")); // อนุญาตหลายระดับพร้อมกัน
      p.set("shuffle", shuffle ? "1" : "0");
      // สำหรับ Kanji ไม่ใช้ตัวเลือก showJapanese/showRomaji/hideKanaIfHasKanji
      router.push(`/flashcards/play?${p.toString()}`);
      return;
    }

    // มิฉะนั้นเป็น Minna
    const p = new URLSearchParams();
    p.set("lessons", selectedLessons.join(","));
    p.set("showJa", showJapanese ? "1" : "0");
    p.set("showRo", showRomaji ? "1" : "0");
    p.set("shuffle", shuffle ? "1" : "0");
    p.set("hideKanaIfHasKanji", hideKanaIfHasKanji ? "1" : "0");
    router.push(`/flashcards/play?${p.toString()}`);
  };

  // ลิงก์ “ดูตาราง …” (เหมือนเดิม)
  const lessonsParam = useMemo(() => selectedLessons.join(","), [selectedLessons]);
  const kanjiParam = useMemo(() => selectedKanji.join(","), [selectedKanji]);

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Flashcards – เลือกบทและตัวเลือก</h1>

      {/* ===== Kanji ===== */}
      <section className="border rounded-xl bg-white">
        <div className="px-4 py-3 border-b rounded-t-xl font-medium">Kanji</div>
        <div className="p-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {KANJI_LEVELS.map((lv) => (
            <label
              key={lv.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer ${
                selectedKanji.includes(lv.id) ? "bg-blue-50 border-blue-300" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={selectedKanji.includes(lv.id)}
                onChange={() => toggleKanji(lv.id)}
              />
              {lv.label}
            </label>
          ))}
        </div>

        <div className="px-4 pb-4">
          <Link
            href={
              kanjiParam
                ? `/flashcards/table?kanji=${encodeURIComponent(kanjiParam)}`
                : "#"
            }
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-slate-50 ${
              !kanjiParam ? "pointer-events-none opacity-50" : ""
            }`}
          >
            ดูตารางคันจิ
          </Link>
        </div>
      </section>

      {/* ===== Minna ===== */}
      <section className="border rounded-xl bg-white mt-6">
        <div className="px-4 py-3 border-b rounded-t-xl font-medium">
          Minna no Nihongo (เช็คได้หลายบท)
        </div>
        <div className="p-4 flex flex-wrap gap-3">
          {MINNA_LESSONS.map((ls) => (
            <label
              key={ls.id}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer ${
                selectedLessons.includes(ls.id) ? "bg-blue-50 border-blue-300" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={selectedLessons.includes(ls.id)}
                onChange={() => toggleLesson(ls.id)}
              />
              {ls.label}
            </label>
          ))}
        </div>

        <div className="px-4 pb-4">
          <Link
            href={
              lessonsParam
                ? `/flashcards/table?lessons=${encodeURIComponent(lessonsParam)}`
                : "#"
            }
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-slate-50 ${
              !lessonsParam ? "pointer-events-none opacity-50" : ""
            }`}
          >
            ดูตารางคำศัพท์
          </Link>
        </div>
      </section>

      {/* ===== ตัวเลือกการแสดงผล ===== */}
      <section className="border rounded-xl bg-white mt-6">
        <div className="px-4 py-3 border-b rounded-t-xl">
          <div className="font-medium">ตัวเลือกการแสดงผล</div>
        </div>
        <div className="p-4 space-y-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showJapanese}
              onChange={(e) => setShowJapanese(e.target.checked)}
              disabled={selectedKanji.length > 0 /* Kanji mode ไม่ใช้ตัวเลือกนี้ */}
            />
            แสดงภาษาญี่ปุ่น (คันจิ/ฮิรางานะ)
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={showRomaji}
              onChange={(e) => setShowRomaji(e.target.checked)}
              disabled={selectedKanji.length > 0}
            />
            แสดงโรมาจิ (romaji)
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={hideKanaIfHasKanji}
              onChange={(e) => setHideKanaIfHasKanji(e.target.checked)}
              disabled={selectedKanji.length > 0}
            />
            ซ่อนฮิรางานะถ้าคำนั้นมีคันจิ
          </label>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={shuffle}
              onChange={(e) => setShuffle(e.target.checked)}
            />
            สุ่มลำดับการ์ด
          </label>
        </div>
      </section>

      <div className="mt-6">
        <button
          onClick={onStart}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          เริ่มเรียน
        </button>
      </div>
    </main>
  );
}
