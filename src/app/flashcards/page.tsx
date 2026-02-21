"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase"; 
import { collection, addDoc, deleteDoc, doc, onSnapshot, orderBy, query } from "firebase/firestore";

interface CustomDataSet {
  id: string;
  name: string;
  data: string; 
}

interface TempWord {
  kanji: string;
  kana: string;
  romaji: string;
  group: string;
  meaning: string;
}

const KANJI_LEVELS = [
  { id: "n5", label: "Kanji – N5" },
  { id: "n4", label: "Kanji – N4" },
  { id: "n3", label: "Kanji – N3" },
  { id: "n2", label: "Kanji – N2" },
  { id: "n1", label: "Kanji – N1" },
];

const MINNA_LESSONS = Array.from({ length: 50 }, (_, i) => ({
  id: String(i + 1),
  label: `Minna no Nihongo – บท ${i + 1}`,
}));

export default function FlashcardsChooser() {
  const router = useRouter();

  const [selectedKanji, setSelectedKanji] = useState<string[]>([]);
  const [selectedLessons, setSelectedLessons] = useState<string[]>([]);
  const [selectedCustom, setSelectedCustom] = useState<string[]>([]);

  const [customSets, setCustomSets] = useState<CustomDataSet[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [loadingCustom, setLoadingCustom] = useState(true);

  const [tempWords, setTempWords] = useState<TempWord[]>([]);
  const [currentWord, setCurrentWord] = useState<TempWord>({
    kanji: "", kana: "", romaji: "", group: "", meaning: ""
  });

  const [showJapanese, setShowJapanese] = useState(true);
  const [showRomaji, setShowRomaji] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [hideKanaIfHasKanji, setHideKanaIfHasKanji] = useState(false);
  const [onlyVerbs, setOnlyVerbs] = useState(false);

  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "custom_flashcards"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const sets = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CustomDataSet[];
      setCustomSets(sets);
      setLoadingCustom(false);
    }, (error) => {
      console.error("Error fetching custom sets:", error);
      setLoadingCustom(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;

    const update = () => {
      if (dragging) return;
      const max = el.scrollWidth - el.clientWidth;
      const val = max <= 0 ? 0 : (el.scrollLeft / max) * 100;
      setProgress(Math.max(0, Math.min(100, val)));
    };

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

  const scrollBy = (dx: number) => sliderRef.current?.scrollBy({ left: dx, behavior: "smooth" });

  const onRangeInput = (val: number) => {
    const el = sliderRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    el.scrollTo({ left: (val / 100) * max, behavior: "auto" });
    setProgress(val);
  };

  const onDragStart = () => setDragging(true);
  const onDragEnd = () => {
    setDragging(false);
    const el = sliderRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const val = max <= 0 ? 0 : (el.scrollLeft / max) * 100;
    setProgress(Math.max(0, Math.min(100, val)));
  };

  const clearOthers = (mode: "kanji" | "minna" | "custom") => {
    if (mode !== "kanji") setSelectedKanji([]);
    if (mode !== "minna") setSelectedLessons([]);
    if (mode !== "custom") setSelectedCustom([]);
  };

  const toggleKanji = (id: string) => {
    clearOthers("kanji");
    setSelectedKanji((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleLesson = (id: string) => {
    clearOthers("minna");
    setSelectedLessons((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleCustom = (id: string) => {
    clearOthers("custom");
    setSelectedCustom((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const handleAddWordToList = () => {
    if (!currentWord.meaning && !currentWord.kana && !currentWord.kanji) {
      alert("กรุณากรอกข้อมูลคำศัพท์อย่างน้อย 1 ช่อง");
      return;
    }
    setTempWords([...tempWords, currentWord]);
    setCurrentWord({ kanji: "", kana: "", romaji: "", group: "", meaning: "" });
  };

  const handleRemoveWordFromList = (indexToRemove: number) => {
    setTempWords(tempWords.filter((_, index) => index !== indexToRemove));
  };

  const handleSaveSetToFirebase = async () => {
    const trimmedName = newName.trim();
    if (!trimmedName || tempWords.length === 0) {
      alert("กรุณากรอกชื่อชุดและเพิ่มคำศัพท์อย่างน้อย 1 คำ");
      return;
    }

    // ✅ ระบบเช็คชื่อซ้ำ (Case Insensitive: testset == TestSet)
    const isDuplicate = customSets.some(
      (set) => set.name.toLowerCase() === trimmedName.toLowerCase()
    );

    if (isDuplicate) {
      alert(`ชุดข้อมูลชื่อ "${trimmedName}" มีอยู่แล้ว กรุณาตั้งชื่ออื่นครับ`);
      return;
    }
    
    const formattedData = tempWords.map(w => 
      `${w.kanji} | ${w.kana} | ${w.romaji} | ${w.group} | ${w.meaning}`
    ).join("\n");

    try {
      await addDoc(collection(db, "custom_flashcards"), {
        name: trimmedName,
        data: formattedData,
        createdAt: new Date()
      });
      setNewName("");
      setTempWords([]);
      setIsAdding(false);
    } catch (error) {
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูลลง Firebase");
    }
  };

  const handleDeleteSet = async (id: string) => {
    if (confirm("คุณแน่ใจหรือไม่ว่าต้องการลบชุดข้อมูลนี้?")) {
      try {
        await deleteDoc(doc(db, "custom_flashcards", id));
        setSelectedCustom((prev) => prev.filter(x => x !== id));
      } catch (error) {
        alert("เกิดข้อผิดพลาดในการลบข้อมูล");
      }
    }
  };

  const onStart = () => {
    if (selectedKanji.length === 0 && selectedLessons.length === 0 && selectedCustom.length === 0) {
      alert("กรุณาเลือกอย่างน้อยหนึ่งบท/ระดับ หรือชุดข้อมูลก่อน");
      return;
    }

    const p = new URLSearchParams();
    p.set("showJa", showJapanese ? "1" : "0");
    p.set("showRo", showRomaji ? "1" : "0");
    p.set("hideKanaIfHasKanji", hideKanaIfHasKanji ? "1" : "0");
    p.set("shuffle", shuffle ? "1" : "0");
    p.set("onlyVerbs", onlyVerbs ? "1" : "0");

    if (selectedCustom.length > 0) {
      const selectedData = customSets
        .filter((s) => selectedCustom.includes(s.id))
        .map((s) => s.data)
        .join("\n---\n");
      
      sessionStorage.setItem("play_custom_data", selectedData);
      p.set("mode", "custom");
    } else if (selectedKanji.length > 0) {
      p.set("kanji", selectedKanji.join(","));
    } else {
      p.set("lessons", selectedLessons.join(","));
    }
    
    router.push(`/flashcards/play?${p.toString()}`);
  };

  const kanjiParam = useMemo(() => selectedKanji.join(","), [selectedKanji]);

  return (
    <main className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Flashcards – เลือกบทและตัวเลือก</h1>

      <div className="rounded-xl border bg-white p-4 mb-6 shadow-sm">
        <h2 className="text-lg font-medium mb-3">ฝึกเขียน</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/practice/hiragana" className="px-4 py-2 rounded-lg border hover:bg-slate-50 flex items-center gap-2">
            ✍️ ฮิรางานะ
          </Link>
          <Link href="/practice/katakana" className="px-4 py-2 rounded-lg border hover:bg-slate-50 flex items-center gap-2">
            ✍️ คาตะคานะ
          </Link>
          <Link href="/quizzes" className="ml-1 px-4 py-2 rounded-lg border bg-amber-50 hover:bg-amber-100 flex items-center gap-2">
            🧩 Quiz
          </Link>
        </div>
      </div>

      {/* ===== Custom Data Sets (Firebase) ===== */}
      <section className="border rounded-xl bg-white mb-6 shadow-sm overflow-hidden border-indigo-200">
        <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center">
          <div className="font-bold text-indigo-800">✨ Custom Dataset</div>
          <button 
            onClick={() => { setIsAdding(!isAdding); setTempWords([]); setNewName(""); }}
            className={`text-xs px-4 py-2 rounded-lg font-bold transition-colors ${isAdding ? "bg-slate-200 text-slate-700" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
          >
            {isAdding ? "ยกเลิก" : "+ สร้างชุดข้อมูล"}
          </button>
        </div>

        {isAdding && (
          <div className="p-5 bg-indigo-50/30 border-b border-indigo-100">
            <div className="mb-6">
              <label className="block text-sm font-bold text-indigo-900 mb-2">ชื่อชุดข้อมูล</label>
              <input 
                type="text"
                placeholder="เช่น คำศัพท์บทที่ 1 หรือ ศัพท์สอบย่อย..." 
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full p-3 border-2 border-indigo-200 rounded-xl outline-indigo-500 font-medium"
              />
            </div>

            <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm mb-6">
              <label className="block text-sm font-bold text-slate-700 mb-3">เพิ่มคำศัพท์ใหม่</label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
                <div>
                  <div className="text-[10px] text-slate-500 font-bold mb-1 uppercase">Kanji</div>
                  <input type="text" value={currentWord.kanji} onChange={(e) => setCurrentWord({...currentWord, kanji: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-indigo-400" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold mb-1 uppercase">Kana</div>
                  <input type="text" value={currentWord.kana} onChange={(e) => setCurrentWord({...currentWord, kana: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-indigo-400" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold mb-1 uppercase">Romaji</div>
                  <input type="text" value={currentWord.romaji} onChange={(e) => setCurrentWord({...currentWord, romaji: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-indigo-400" />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold mb-1 uppercase">Group</div>
                  <input type="text" value={currentWord.group} onChange={(e) => setCurrentWord({...currentWord, group: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-indigo-400" />
                </div>
                <div>
                  <div className="text-[10px] text-rose-500 font-bold mb-1 uppercase">ความหมาย *</div>
                  <input type="text" value={currentWord.meaning} onChange={(e) => setCurrentWord({...currentWord, meaning: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && handleAddWordToList()} className="w-full p-2 border rounded-lg text-sm outline-indigo-400" />
                </div>
              </div>
              <button onClick={handleAddWordToList} className="w-full py-2.5 bg-indigo-100 text-indigo-700 rounded-lg font-bold hover:bg-indigo-200">
                + เพิ่มคำนี้ลงในรายการ
              </button>
            </div>

            {tempWords.length > 0 && (
              <div className="mb-6">
                <div className="text-sm font-bold text-slate-700 mb-2">คำที่เตรียมบันทึก ({tempWords.length} คำ)</div>
                <table className="w-full text-left text-sm bg-white border rounded-xl overflow-hidden">
                  <thead className="bg-slate-50 border-b">
                    <tr><th className="p-2">Kanji</th><th className="p-2">Kana</th><th className="p-2">ความหมาย</th><th className="p-2 w-10"></th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {tempWords.map((w, i) => (
                      <tr key={i}>
                        <td className="p-2">{w.kanji}</td><td className="p-2">{w.kana}</td><td className="p-2">{w.meaning}</td>
                        <td className="p-2"><button onClick={() => handleRemoveWordFromList(i)} className="text-rose-400 font-bold">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button onClick={handleSaveSetToFirebase} disabled={tempWords.length === 0} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 disabled:opacity-50">
              💾 บันทึกชุดข้อมูลนี้ขึ้น Cloud
            </button>
          </div>
        )}

        <div className="p-4">
          {loadingCustom ? (
            <div className="text-center text-slate-400 text-sm py-4">กำลังโหลดข้อมูล...</div>
          ) : customSets.length === 0 ? (
            <div className="text-center text-slate-400 text-sm py-4 italic">ยังไม่มีชุดข้อมูล</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {customSets.map((set) => (
                <div key={set.id} className="flex items-center gap-2">
                  <label className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer ${selectedCustom.includes(set.id) ? "bg-indigo-50 border-indigo-400" : "hover:border-indigo-200"}`}>
                    <input type="checkbox" checked={selectedCustom.includes(set.id)} onChange={() => toggleCustom(set.id)} className="w-5 h-5 accent-indigo-600" />
                    <span className="text-sm font-bold text-slate-700 truncate">{set.name}</span>
                  </label>
                  <button onClick={() => handleDeleteSet(set.id)} className="p-3 bg-slate-50 border rounded-xl hover:text-rose-500">🗑️</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 pb-4 bg-indigo-50/20 pt-2 border-t border-indigo-50">
          <Link
            href={selectedCustom.length ? `/flashcards/custom-table?custom=${encodeURIComponent(selectedCustom.join(","))}` : "#"}
            className={`text-sm inline-flex items-center gap-2 rounded-lg border px-4 py-2 font-bold shadow-sm ${
              selectedCustom.length ? "bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50" : "pointer-events-none opacity-40 bg-slate-50 text-slate-400"
            }`}
          >
            📋 แก้ไข / เพิ่มคำในชุดข้อมูลนี้
          </Link>
        </div>
      </section>

      {/* ===== Kanji ===== */}
      <section className="border rounded-xl bg-white shadow-sm mb-6">
        <div className="px-4 py-3 border-b rounded-t-xl font-medium bg-slate-50/50">Kanji</div>
        <div className="p-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {KANJI_LEVELS.map((lv) => (
            <label key={lv.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer ${selectedKanji.includes(lv.id) ? "bg-blue-50 border-blue-300" : "hover:border-slate-300"}`}>
              <input type="checkbox" checked={selectedKanji.includes(lv.id)} onChange={() => toggleKanji(lv.id)} className="w-4 h-4 accent-blue-600" />
              <span className="text-sm">{lv.label}</span>
            </label>
          ))}
        </div>
        <div className="px-4 pb-4">
          <Link href={kanjiParam ? `/flashcards/table?kanji=${encodeURIComponent(kanjiParam)}` : "#"} className={`text-sm inline-flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-slate-50 ${!kanjiParam ? "pointer-events-none opacity-50" : ""}`}>
            ดูตารางคันจิ
          </Link>
        </div>
      </section>

      {/* ===== Minna ===== */}
      <section className="border rounded-xl bg-white mt-6 shadow-sm">
        <div className="px-4 py-3 border-b rounded-t-xl font-medium bg-slate-50/50">Minna no Nihongo</div>
        <div className="relative p-4">
          <button type="button" onClick={() => scrollBy(-280)} className="z-10 absolute left-2 top-[45%] -translate-y-1/2 rounded-full border bg-white/90 w-9 h-9 shadow flex items-center justify-center">‹</button>
          <button type="button" onClick={() => scrollBy(280)} className="z-10 absolute right-2 top-[45%] -translate-y-1/2 rounded-full border bg-white/90 w-9 h-9 shadow flex items-center justify-center">›</button>
          <div ref={sliderRef} className="flex gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory px-1 py-2 no-scrollbar" style={{ scrollbarWidth: "none" }}>
            {MINNA_LESSONS.map((ls) => (
              <label key={ls.id} className={`min-w-[240px] snap-start flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer ${selectedLessons.includes(ls.id) ? "bg-blue-50 border-blue-300" : ""}`}>
                <input type="checkbox" checked={selectedLessons.includes(ls.id)} onChange={() => toggleLesson(ls.id)} className="w-4 h-4 accent-blue-600" />
                <span className="text-sm">{ls.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-4 px-2">
            <input type="range" min={0} max={100} step={0.1} value={progress} onChange={(e) => onRangeInput(parseFloat(e.target.value))} onMouseDown={onDragStart} onMouseUp={onDragEnd} onTouchStart={onDragStart} onTouchEnd={onDragEnd} className="w-full h-1.5 appearance-none bg-slate-100 rounded-full accent-blue-600 cursor-pointer" />
          </div>
        </div>
        <div className="px-4 pb-4">
          <Link href={selectedLessons.length ? `/flashcards/table?lessons=${encodeURIComponent(selectedLessons.join(","))}` : "#"} className={`text-sm inline-flex items-center gap-2 rounded-lg border px-3 py-2 hover:bg-slate-50 ${!selectedLessons.length ? "pointer-events-none opacity-50" : ""}`}>
            ดูตารางคำศัพท์
          </Link>
        </div>
      </section>

      {/* ===== ตัวเลือกการแสดงผล ===== */}
      <section className="border rounded-xl bg-white mt-6 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50/50 font-medium text-slate-700">ตัวเลือกการแสดงผล</div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={showJapanese} onChange={(e) => setShowJapanese(e.target.checked)} className="w-4 h-4 accent-blue-600" /> <span className="text-sm text-slate-600">แสดงภาษาญี่ปุ่น (คันจิ/ฮิรางานะ)</span></label>
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={showRomaji} onChange={(e) => setShowRomaji(e.target.checked)} className="w-4 h-4 accent-blue-600" /> <span className="text-sm text-slate-600">แสดงโรมาจิ (romaji)</span></label>
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={hideKanaIfHasKanji} onChange={(e) => setHideKanaIfHasKanji(e.target.checked)} className="w-4 h-4 accent-blue-600" /> <span className="text-sm text-slate-600">ซ่อนฮิรางานะถ้ามีคันจิ</span></label>
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} className="w-4 h-4 accent-blue-600" /> <span className="text-sm text-slate-600 font-medium">สุ่มลำดับการ์ด</span></label>
        </div>
        <div className="px-4 py-3 bg-blue-50/50 border-t border-blue-100">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={onlyVerbs} onChange={(e) => setOnlyVerbs(e.target.checked)} className="w-5 h-5 accent-blue-700" />
            <span className="text-sm font-bold text-blue-800">คัดเฉพาะคำกริยา [I, II, III] (Minna & Custom)</span>
          </label>
        </div>
      </section>

      <div className="mt-8 mb-10">
        <button onClick={onStart} className="w-full md:w-auto px-10 py-4 rounded-xl bg-blue-600 text-white font-black text-lg hover:bg-blue-700 shadow-xl transition-all active:scale-95">
          เริ่มเรียน 🚀
        </button>
      </div>
    </main>
  );
}