"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { db, auth } from "@/lib/firebase"; 
import { onAuthStateChanged, User } from "firebase/auth"; 
import { collection, addDoc, deleteDoc, doc, getDoc, onSnapshot, query, where } from "firebase/firestore"; // ✅ เพิ่ม getDoc
import * as XLSX from "xlsx"; 

interface CustomDataSet {
  id: string;
  name: string;
  data: string; 
  createdAt?: any;
  creatorName?: string;
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

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [selectedKanji, setSelectedKanji] = useState<string[]>([]);
  const [selectedLessons, setSelectedLessons] = useState<string[]>([]);
  const [selectedCustom, setSelectedCustom] = useState<string[]>([]);

  const [customSets, setCustomSets] = useState<CustomDataSet[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [loadingCustom, setLoadingCustom] = useState(true);

  // ✅ State สำหรับระบบ Import Code
  const [importCode, setImportCode] = useState("");
  const [isFetchingCode, setIsFetchingCode] = useState(false);

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
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setCustomSets([]);
      setLoadingCustom(false);
      return;
    }

    setLoadingCustom(true);
    const q = query(
      collection(db, "custom_flashcards"),
      where("createdByUid", "==", currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let sets = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CustomDataSet[];

      sets.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return timeB - timeA;
      });

      setCustomSets(sets);
      setLoadingCustom(false);
    }, (error) => {
      console.error("Error fetching custom sets:", error);
      setLoadingCustom(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

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

  const toggleKanji = (id: string) => { clearOthers("kanji"); setSelectedKanji((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]); };
  const toggleLesson = (id: string) => { clearOthers("minna"); setSelectedLessons((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]); };
  const toggleCustom = (id: string) => { clearOthers("custom"); setSelectedCustom((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]); };

  const handleAddWordToList = () => {
    if (!currentWord.meaning && !currentWord.kana && !currentWord.kanji) {
      alert("กรุณากรอกข้อมูลคำศัพท์อย่างน้อย 1 ช่อง");
      return;
    }
    setTempWords([...tempWords, currentWord]);
    setCurrentWord({ kanji: "", kana: "", romaji: "", group: "", meaning: "" });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const baseName = file.name.replace(/\.[^/.]+$/, "");
    if (!newName) setNewName(baseName);

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: "array" });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const rows = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1 });

      const parsedWords: TempWord[] = [];

      rows.forEach((row, index) => {
        if (!row || row.length === 0) return;
        const kanji = String(row[0] || "").trim();
        const kana = String(row[1] || "").trim();
        const romaji = String(row[2] || "").trim();
        const group = String(row[3] || "").trim();
        const meaning = String(row[4] || "").trim();

        if (index === 0 && (kanji.toLowerCase() === "kanji" || meaning.includes("ความหมาย"))) return;

        if (kanji || kana || meaning) {
          parsedWords.push({ kanji, kana, romaji, group, meaning });
        }
      });

      if (parsedWords.length > 0) {
        setTempWords((prev) => [...prev, ...parsedWords]);
      } else {
        alert("ไม่พบข้อมูลคำศัพท์ในไฟล์นี้ หรือรูปแบบคอลัมน์ไม่ถูกต้อง");
      }
    } catch (error) {
      alert("เกิดข้อผิดพลาดในการอ่านไฟล์ Excel");
    } finally {
      e.target.value = "";
    }
  };

  // ✅ ฟังก์ชันดึงข้อมูลจากรหัสแชร์ (Import Data via Document ID)
  const handleImportFromCode = async () => {
    if (!importCode.trim()) {
      alert("กรุณาใส่รหัสแชร์ก่อนครับ");
      return;
    }

    setIsFetchingCode(true);
    try {
      const docRef = doc(db, "custom_flashcards", importCode.trim());
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const d = docSnap.data();
        
        // ตั้งชื่อใหม่ เติม (Copy) ให้รู้ว่าก็อปมา
        setNewName(d.name ? `${d.name} (Copy)` : "Imported Dataset");

        // แปลงข้อความกลับเป็น Array
        const rawData = d.data || "";
        const lines = rawData.split("\n").filter((l: string) => l.trim() && l !== "---");
        
        const parsedWords: TempWord[] = lines.map((line: string) => {
          const parts = line.split("|").map((p: string) => p.trim());
          return {
            kanji: parts[0] || "",
            kana: parts[1] || "",
            romaji: parts[2] || "",
            group: parts[3] || "",
            meaning: parts[4] || "",
          };
        });

        if (parsedWords.length > 0) {
          setTempWords((prev) => [...prev, ...parsedWords]);
          alert(`ดึงข้อมูลสำเร็จ ${parsedWords.length} คำ! \nตรวจสอบรายการด้านล่างแล้วกด "บันทึกชุดข้อมูล" เพื่อเป็นเจ้าของได้เลยครับ`);
          setImportCode(""); // ล้างช่อง
        } else {
          alert("รหัสแชร์ถูกต้อง แต่ไม่พบคำศัพท์ในชุดข้อมูลนี้");
        }
      } else {
        alert("ไม่พบชุดข้อมูลนี้ในระบบ หรือรหัสแชร์ไม่ถูกต้องครับ");
      }
    } catch (error) {
      console.error(error);
      alert("เกิดข้อผิดพลาดในการดึงข้อมูล (ตรวจสอบการเชื่อมต่ออินเทอร์เน็ต)");
    } finally {
      setIsFetchingCode(false);
    }
  };

  // ✅ ฟังก์ชันคัดลอกรหัสแชร์
  const handleCopyShareCode = (id: string) => {
    navigator.clipboard.writeText(id).then(() => {
      alert(`คัดลอกรหัสแชร์สำเร็จ!\nรหัสของคุณคือ: ${id}\n\nส่งให้เพื่อนนำไปกรอกในช่องนำเข้าได้เลยครับ`);
    }).catch(() => {
      alert(`ไม่สามารถคัดลอกอัตโนมัติได้ รหัสของคุณคือ:\n${id}`);
    });
  };

  const handleRemoveWordFromList = (indexToRemove: number) => {
    setTempWords(tempWords.filter((_, index) => index !== indexToRemove));
  };

  const handleSaveSetToFirebase = async () => {
    if (!currentUser) {
      alert("กรุณาล็อกอินก่อนสร้างชุดข้อมูล");
      return;
    }

    const trimmedName = newName.trim();
    if (!trimmedName || tempWords.length === 0) {
      alert("กรุณากรอกชื่อชุดข้อมูลและเพิ่มคำศัพท์อย่างน้อย 1 คำครับ");
      return;
    }

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

    const creatorDisplay = currentUser.displayName || currentUser.email?.split("@")[0] || "ผู้ใช้ทั่วไป";

    try {
      await addDoc(collection(db, "custom_flashcards"), {
        name: trimmedName,
        data: formattedData,
        createdAt: new Date(),
        createdByUid: currentUser.uid, 
        creatorName: creatorDisplay 
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
        alert("เกิดข้อผิดพลาดในการลบข้อมูล (คุณอาจไม่มีสิทธิ์ลบข้อมูลของคนอื่น)");
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
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Flashcards – เลือกบทและตัวเลือก</h1>

      <div className="rounded-xl border bg-white p-4 mb-6 shadow-sm">
        <h2 className="text-lg font-medium mb-3">ฝึกเขียน</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/practice/hiragana" className="px-4 py-2 rounded-lg border hover:bg-slate-50 flex items-center gap-2">✍️ ฮิรางานะ</Link>
          <Link href="/practice/katakana" className="px-4 py-2 rounded-lg border hover:bg-slate-50 flex items-center gap-2">✍️ คาตะคานะ</Link>
          <Link href="/quizzes" className="ml-1 px-4 py-2 rounded-lg border bg-amber-50 hover:bg-amber-100 flex items-center gap-2">🧩 Quiz</Link>
        </div>
      </div>

      {/* ===== Custom Data Sets (Firebase) ===== */}
      <section className="border rounded-xl bg-white mb-6 shadow-sm overflow-hidden border-indigo-200">
        <div className="px-4 py-3 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center">
          <div className="font-bold text-indigo-800">✨ Custom Dataset (ชุดข้อมูลของคุณ)</div>
          {currentUser && (
            <button 
              onClick={() => { setIsAdding(!isAdding); setTempWords([]); setNewName(""); }}
              className={`text-xs px-4 py-2 rounded-lg font-bold transition-colors ${isAdding ? "bg-slate-200 text-slate-700 hover:bg-slate-300" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}
            >
              {isAdding ? "ยกเลิกการสร้าง" : "+ สร้างชุดข้อมูลใหม่"}
            </button>
          )}
        </div>

        {!currentUser ? (
          <div className="p-8 text-center bg-indigo-50/20">
            <div className="text-slate-500 font-medium mb-3">คุณต้องล็อกอินเพื่อสร้างและเล่นชุดข้อมูลของตัวเองครับ</div>
            <Link href="/login" className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-md">ไปที่หน้าล็อกอิน</Link>
          </div>
        ) : (
          <>
            {/* ===================== ส่วนสร้างชุดข้อมูล ===================== */}
            {isAdding && (
              <div className="p-5 bg-indigo-50/30 border-b border-indigo-100">
                <div className="mb-4">
                  <label className="block text-sm font-bold text-indigo-900 mb-2">ชื่อชุดข้อมูล</label>
                  <input 
                    type="text"
                    placeholder="ตั้งชื่อชุดข้อมูล (ถ้าโหลด Excel หรือนำเข้ารหัส จะตั้งให้อัตโนมัติ)" 
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full p-3 border-2 border-indigo-200 rounded-xl outline-indigo-500 font-bold text-indigo-900 bg-white"
                  />
                </div>

                {/* ✅ กล่อง 2 ทางเลือก: นำเข้า Excel หรือ นำเข้ารหัสแชร์ */}
                <div className="grid md:grid-cols-2 gap-4 mb-4">
                  {/* กล่อง 1: Excel */}
                  <div className="bg-white p-4 rounded-xl border-2 border-dashed border-indigo-300 hover:border-indigo-500 transition-colors flex flex-col justify-center items-center relative cursor-pointer min-h-[100px]">
                    <div className="text-3xl mb-1">📥</div>
                    <div className="text-sm font-bold text-indigo-700 text-center">อัปโหลดไฟล์ Excel</div>
                    <div className="text-[10px] text-slate-500 text-center mt-1">คอลัมน์ A-E (Kanji, Kana, Romaji, Group, ความหมาย)</div>
                    <input 
                      type="file" 
                      accept=".xlsx, .xls"
                      onChange={handleFileUpload}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      title="คลิกเพื่อเลือกไฟล์ Excel"
                    />
                  </div>

                  {/* ✅ กล่อง 2: นำเข้ารหัสแชร์ */}
                  <div className="bg-white p-4 rounded-xl border border-indigo-200 shadow-sm flex flex-col justify-center">
                    <label className="block text-sm font-bold text-indigo-700 mb-2 flex items-center gap-1">
                      🔗 ดึงข้อมูลจากรหัสแชร์
                    </label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="วางรหัสแชร์ที่นี่..." 
                        value={importCode}
                        onChange={(e) => setImportCode(e.target.value)}
                        className="flex-1 p-2 border-2 border-indigo-100 rounded-lg text-sm outline-indigo-400 font-mono"
                      />
                      <button 
                        onClick={handleImportFromCode}
                        disabled={isFetchingCode || !importCode.trim()}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 whitespace-nowrap shadow-sm"
                      >
                        {isFetchingCode ? "กำลังดึง..." : "ดึงข้อมูล"}
                      </button>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-2">ใส่รหัสที่คัดลอกมาจากเพื่อน เพื่อ Duplicate ชุดข้อมูลเป็นของคุณ</div>
                  </div>
                </div>

                {/* กล่องเพิ่มมือ */}
                <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm mb-6 flex flex-col justify-center">
                  <label className="block text-sm font-bold text-slate-700 mb-2">เพิ่มคำศัพท์ทีละคำ (Manual)</label>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-3">
                    <div><input type="text" placeholder="Kanji" value={currentWord.kanji} onChange={(e) => setCurrentWord({...currentWord, kanji: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-indigo-400" /></div>
                    <div><input type="text" placeholder="Kana" value={currentWord.kana} onChange={(e) => setCurrentWord({...currentWord, kana: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-indigo-400" /></div>
                    <div><input type="text" placeholder="Romaji" value={currentWord.romaji} onChange={(e) => setCurrentWord({...currentWord, romaji: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-indigo-400" /></div>
                    <div><input type="text" placeholder="Group" value={currentWord.group} onChange={(e) => setCurrentWord({...currentWord, group: e.target.value})} className="w-full p-2 border rounded-lg text-sm outline-indigo-400" /></div>
                    <div><input type="text" placeholder="ความหมาย *" value={currentWord.meaning} onChange={(e) => setCurrentWord({...currentWord, meaning: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && handleAddWordToList()} className="w-full p-2 border rounded-lg text-sm outline-indigo-400 border-rose-200" /></div>
                  </div>
                  <button onClick={handleAddWordToList} className="w-full py-2 bg-indigo-50 text-indigo-700 rounded-lg font-bold text-sm hover:bg-indigo-100 transition-colors">
                    + กดเพิ่มคำลงตารางด้านล่าง
                  </button>
                </div>

                {/* ตารางตรวจสอบ */}
                {tempWords.length > 0 && (
                  <div className="mb-6 animate-in fade-in zoom-in duration-300">
                    <div className="flex justify-between items-end mb-2">
                      <div className="text-sm font-bold text-slate-700">รายการคำศัพท์ที่เตรียมบันทึก <span className="text-indigo-600">({tempWords.length} คำ)</span></div>
                      <button onClick={() => setTempWords([])} className="text-xs text-rose-500 font-bold hover:underline">ล้างทั้งหมด</button>
                    </div>
                    <div className="max-h-[300px] overflow-y-auto border rounded-xl bg-white shadow-inner">
                      <table className="min-w-full text-left text-sm">
                        <thead className="bg-slate-50 border-b sticky top-0">
                          <tr><th className="p-3">Kanji</th><th className="p-3">Kana</th><th className="p-3">Romaji</th><th className="p-3 text-center">Group</th><th className="p-3">ความหมาย</th><th className="p-3 w-10"></th></tr>
                        </thead>
                        <tbody className="divide-y">
                          {tempWords.map((w, i) => (
                            <tr key={i} className="hover:bg-slate-50">
                              <td className="p-3">{w.kanji || "-"}</td><td className="p-3">{w.kana || "-"}</td><td className="p-3 text-slate-400">{w.romaji || "-"}</td><td className="p-3 text-center">{w.group ? <span className="bg-slate-100 px-2 py-0.5 rounded text-[10px]">{w.group}</span> : "-"}</td><td className="p-3">{w.meaning}</td>
                              <td className="p-3 text-center"><button onClick={() => handleRemoveWordFromList(i)} className="text-rose-400 hover:text-rose-600 font-bold text-lg leading-none">✕</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <button onClick={handleSaveSetToFirebase} disabled={tempWords.length === 0 || !newName.trim()} className="w-full py-4 bg-indigo-600 text-white rounded-xl font-black text-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all">
                  💾 บันทึกเป็นชุดข้อมูลของคุณ
                </button>
              </div>
            )}

            {/* ===================== รายการชุดข้อมูลที่มีอยู่แล้ว ===================== */}
            <div className="p-4">
              {loadingCustom ? (
                <div className="text-center text-slate-400 text-sm py-4">กำลังโหลดข้อมูล...</div>
              ) : customSets.length === 0 ? (
                <div className="text-center text-slate-400 text-sm py-4 italic">คุณยังไม่มีชุดข้อมูลเลย ลองสร้างหรือนำเข้ารหัสแชร์ดูสิ!</div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {customSets.map((set) => (
                    <div key={set.id} className="flex items-center gap-2 group w-full min-w-0">
                      <label className={`flex-1 flex items-center gap-2 p-3 sm:p-4 rounded-xl border-2 cursor-pointer transition-colors min-w-0 overflow-hidden ${selectedCustom.includes(set.id) ? "bg-indigo-50 border-indigo-400 shadow-sm" : "bg-white hover:border-indigo-200"}`}>
                        <input type="checkbox" checked={selectedCustom.includes(set.id)} onChange={() => toggleCustom(set.id)} className="w-5 h-5 accent-indigo-600 shrink-0" />
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <div className="text-sm font-bold text-slate-700 truncate" title={set.name}>{set.name}</div>
                          <div className="text-[10px] text-slate-400 mt-0.5 truncate">สร้างโดย: {set.creatorName || "คุณ"}</div>
                        </div>
                      </label>

                      <div className="flex flex-col gap-1 shrink-0 h-full">
                        {/* ✅ ปุ่มแชร์ (คัดลอก Document ID) */}
                        <button 
                          onClick={() => handleCopyShareCode(set.id)} 
                          className="flex-1 px-3 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100 transition-colors flex items-center justify-center text-sm font-bold"
                          title="คัดลอกรหัสแชร์ส่งให้เพื่อน"
                        >
                          🔗
                        </button>
                        {/* ปุ่มลบ */}
                        <button 
                          onClick={() => handleDeleteSet(set.id)} 
                          className="flex-1 px-3 bg-rose-50 border border-rose-100 rounded-lg text-rose-300 hover:text-rose-600 hover:bg-rose-100 transition-colors flex items-center justify-center"
                          title="ลบชุดข้อมูล"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-4 pb-4 bg-indigo-50/20 pt-2 border-t border-indigo-50">
              <Link
                href={selectedCustom.length ? `/flashcards/custom-table?custom=${encodeURIComponent(selectedCustom.join(","))}` : "#"}
                className={`text-sm inline-flex items-center gap-2 rounded-lg border px-5 py-2.5 font-bold shadow-sm ${
                  selectedCustom.length ? "bg-white text-indigo-700 border-indigo-300 hover:bg-indigo-50" : "pointer-events-none opacity-40 bg-slate-50 text-slate-400"
                }`}
              >
                📋 จัดการคำศัพท์ในชุดที่เลือก (ดู / แก้ไข / เพิ่มคำ)
              </Link>
            </div>
          </>
        )}
      </section>

      {/* ===== Kanji ===== */}
      <section className="border rounded-xl bg-white shadow-sm mb-6">
        <div className="px-4 py-3 border-b rounded-t-xl font-medium bg-slate-50/50">Kanji</div>
        <div className="p-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {KANJI_LEVELS.map((lv) => (
            <label key={lv.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer ${selectedKanji.includes(lv.id) ? "bg-blue-50 border-blue-300" : "hover:border-slate-300"}`}>
              <input type="checkbox" checked={selectedKanji.includes(lv.id)} onChange={() => toggleKanji(lv.id)} className="w-4 h-4 accent-blue-600 shrink-0" />
              <span className="text-sm truncate">{lv.label}</span>
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
                <input type="checkbox" checked={selectedLessons.includes(ls.id)} onChange={() => toggleLesson(ls.id)} className="w-4 h-4 accent-blue-600 shrink-0" />
                <span className="text-sm truncate">{ls.label}</span>
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
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={showJapanese} onChange={(e) => setShowJapanese(e.target.checked)} className="w-4 h-4 accent-blue-600 shrink-0" /> <span className="text-sm text-slate-600">แสดงภาษาญี่ปุ่น (คันจิ/ฮิรางานะ)</span></label>
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={showRomaji} onChange={(e) => setShowRomaji(e.target.checked)} className="w-4 h-4 accent-blue-600 shrink-0" /> <span className="text-sm text-slate-600">แสดงโรมาจิ (romaji)</span></label>
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={hideKanaIfHasKanji} onChange={(e) => setHideKanaIfHasKanji(e.target.checked)} className="w-4 h-4 accent-blue-600 shrink-0" /> <span className="text-sm text-slate-600">ซ่อนฮิรางานะถ้ามีคันจิ</span></label>
          <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} className="w-4 h-4 accent-blue-600 shrink-0" /> <span className="text-sm text-slate-600 font-medium">สุ่มลำดับการ์ด</span></label>
        </div>
        <div className="px-4 py-3 bg-blue-50/50 border-t border-blue-100">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={onlyVerbs} onChange={(e) => setOnlyVerbs(e.target.checked)} className="w-5 h-5 accent-blue-700 shrink-0" />
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