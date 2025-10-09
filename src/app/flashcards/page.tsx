"use client";

import { useMemo, useRef, useState, useEffect } from "react";
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

/** รายการบท Minna (1–12) */
const MINNA_LESSONS = Array.from({ length: 12 }, (_, i) => ({
  id: String(i + 1),
  label: `Minna no Nihongo – บท ${i + 1}`,
}));

export default function FlashcardsChooser() {
  const router = useRouter();

  // เลือกบทย่อย ๆ
  const [selectedKanji, setSelectedKanji] = useState<string[]>([]);
  const [selectedLessons, setSelectedLessons] = useState<string[]>([]);

  // ตัวเลือกแสดงผล
  const [showJapanese, setShowJapanese] = useState(true);
  const [showRomaji, setShowRomaji] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [hideKanaIfHasKanji, setHideKanaIfHasKanji] = useState(false);

  // ref + progress สำหรับสไลด์ Minna
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0); // 0–100
  const [dragging, setDragging] = useState(false);

  // sync จาก scroll/resize -> แต่ "ห้าม" ขณะลาก เพื่อกันวาป
  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;

    const update = () => {
      if (dragging) return; // ขณะลาก ใช้ค่าในสไลด์บาร์นำ ไม่ให้ scroll มาทับ
      const max = el.scrollWidth - el.clientWidth;
      const val = max <= 0 ? 0 : (el.scrollLeft / max) * 100;
      setProgress(Math.max(0, Math.min(100, val)));
    };

    // ใช้ rAF ให้ลื่นขึ้น
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };

    update();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", update);
      cancelAnimationFrame(raf);
    };
  }, [dragging]);

  const scrollBy = (dx: number) =>
    sliderRef.current?.scrollBy({ left: dx, behavior: "smooth" });

  // ตอนลากสไลด์ -> คุม scrollLeft โดยตรง และตั้ง progress ตามที่ลาก
  const onRangeInput = (val: number) => {
    const el = sliderRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // ขณะลาก ใช้ behavior: "auto" ให้ตามนิ้ว/เมาส์แบบเรียลไทม์
    el.scrollTo({ left: (val / 100) * max, behavior: "auto" });
    setProgress(val);
  };

  const onDragStart = () => setDragging(true);
  const onDragEnd = () => {
    setDragging(false);
    // ปล่อยแล้ว sync อีกทีให้ตรงเป๊ะ
    const el = sliderRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const val = max <= 0 ? 0 : (el.scrollLeft / max) * 100;
    setProgress(Math.max(0, Math.min(100, val)));
  };

  // ========== toggle ========== //
  const toggleKanji = (id: string) => {
    if (selectedLessons.length > 0 && !selectedKanji.includes(id)) {
      alert("คุณเลือกหมวด Minna อยู่แล้ว กรุณายกเลิก Minna ก่อน เพื่อเลือก Kanji");
      return;
    }
    setSelectedKanji((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleLesson = (id: string) => {
    if (selectedKanji.length > 0 && !selectedLessons.includes(id)) {
      alert("คุณเลือกหมวด Kanji อยู่แล้ว กรุณายกเลิก Kanji ก่อน เพื่อเลือก Minna");
      return;
    }
    setSelectedLessons((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // เริ่มเรียน
  const onStart = () => {
    if (selectedKanji.length === 0 && selectedLessons.length === 0) {
      alert("กรุณาเลือกอย่างน้อยหนึ่งบท/ระดับก่อน");
      return;
    }

    if (selectedKanji.length > 0) {
      const p = new URLSearchParams();
      p.set("kanji", selectedKanji.join(","));
      p.set("shuffle", shuffle ? "1" : "0");
      router.push(`/flashcards/play?${p.toString()}`);
      return;
    }

    const p = new URLSearchParams();
    p.set("lessons", selectedLessons.join(","));
    p.set("showJa", showJapanese ? "1" : "0");
    p.set("showRo", showRomaji ? "1" : "0");
    p.set("shuffle", shuffle ? "1" : "0");
    p.set("hideKanaIfHasKanji", hideKanaIfHasKanji ? "1" : "0");
    router.push(`/flashcards/play?${p.toString()}`);
  };

  const lessonsParam = useMemo(() => selectedLessons.join(","), [selectedLessons]);
  const kanjiParam = useMemo(() => selectedKanji.join(","), [selectedKanji]);

  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Flashcards – เลือกบทและตัวเลือก</h1>

        <div className="rounded-xl border bg-white p-4 mb-6">
        <h2 className="text-lg font-medium mb-3">ฝึกเขียน</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/practice/hiragana"
            className="px-4 py-2 rounded-lg border hover:bg-slate-50 flex items-center gap-2"
          >
            ✍️ ฮิรางานะ (Hiragana)
          </Link>

          <Link
            href="/practice/katakana"
            className="px-4 py-2 rounded-lg border hover:bg-slate-50 flex items-center gap-2"
          >
            ✍️ คาตะคานะ (Katakana)
          </Link>
        </div>
      </div>
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

      {/* ===== Minna (สไลด์แนวนอน + range ลากได้) ===== */}
      <section className="border rounded-xl bg-white mt-6">
        <div className="px-4 py-3 border-b rounded-t-xl font-medium">
          Minna no Nihongo (เลือกได้หลายบท)
        </div>

        <div className="relative p-4">
          {/* ปุ่มเลื่อนซ้าย/ขวา */}
          <button
            type="button"
            aria-label="scroll-left"
            onClick={() => scrollBy(-280)}
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border bg-white/90 w-9 h-9 shadow hover:bg-slate-50"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="scroll-right"
            onClick={() => scrollBy(280)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border bg-white/90 w-9 h-9 shadow hover:bg-slate-50"
          >
            ›
          </button>

          {/* แถบรายการบท (ปัดนิ้วได้บนมือถือ) */}
          <div
            ref={sliderRef}
            className="flex gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory px-1 py-2"
            style={{ scrollbarWidth: "none" } as any}
          >
            {MINNA_LESSONS.map((ls) => {
              const active = selectedLessons.includes(ls.id);
              return (
                <label
                  key={ls.id}
                  className={`min-w-[240px] snap-start flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer select-none ${
                    active ? "bg-blue-50 border-blue-300" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggleLesson(ls.id)}
                  />
                  {ls.label}
                </label>
              );
            })}
          </div>

          {/* แถบสไลด์แบบ "ลากได้" (range) */}
          <div className="mt-3">
            <input
              type="range"
              min={0}
              max={100}
              step={0.1}
              value={progress}
              onChange={(e) => onRangeInput(parseFloat(e.target.value))}
              onMouseDown={onDragStart}
              onMouseUp={onDragEnd}
              onTouchStart={onDragStart}
              onTouchEnd={onDragEnd}
              className="w-full h-2 appearance-none bg-slate-200 rounded-full accent-slate-600"
            />
          </div>
        </div>

        {/* ปุ่มดูตาราง */}
        <div className="px-4 pb-4">
          <Link
            href={
              selectedLessons.length
                ? `/flashcards/table?lessons=${encodeURIComponent(selectedLessons.join(","))}`
                : "#"
            }
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-slate-50 ${
              selectedLessons.length ? "" : "pointer-events-none opacity-50"
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
              disabled={selectedKanji.length > 0}
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
