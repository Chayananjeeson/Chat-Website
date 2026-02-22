"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { db, auth } from "@/lib/firebase"; 
import { onAuthStateChanged, User } from "firebase/auth"; 
import { doc, getDoc, updateDoc } from "firebase/firestore";
import * as XLSX from "xlsx";

type CustomRow = {
  Kanji: string;
  Kana: string;
  Romaji: string;
  Group: string;
  Meaning: string;
};

type CustomSection = {
  id: string;
  title: string;
  docId: string;
  creatorName?: string; // ✅ เพิ่ม Field
  rows: CustomRow[];
};

export default function CustomFlashcardTablePage() {
  const sp = useSearchParams();
  const customParam = (sp.get("custom") || "").trim();

  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sections, setSections] = useState<CustomSection[]>([]);
  const [current, setCurrent] = useState(0);

  const [editingRow, setEditingRow] = useState<{ sectionIndex: number; rowIndex: number } | null>(null);
  const [editFormData, setEditFormData] = useState<CustomRow | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newWord, setNewWord] = useState<CustomRow>({ Kanji: "", Kana: "", Romaji: "", Group: "", Meaning: "" });

  const [showRomaji, setShowRomaji] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentUser === undefined) return;

    const fetchCustomData = async () => {
      if (!customParam) {
        setError("ไม่พบรหัสชุดข้อมูล");
        setLoading(false);
        return;
      }
      
      if (!currentUser) {
        setError("กรุณาล็อกอินเพื่อดูชุดข้อมูลของคุณ");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(""); 
        const built: CustomSection[] = [];
        const docIds = customParam.split(",").map((s) => s.trim()).filter(Boolean);

        for (const docId of docIds) {
          const docRef = doc(db, "custom_flashcards", docId);
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
            const d = docSnap.data();

            if (d.createdByUid !== currentUser.uid) {
               throw new Error("คุณไม่มีสิทธิ์เข้าถึงชุดข้อมูลนี้ครับ (ไม่ใช่เจ้าของ)");
            }

            const rawData = (d.data || "") as string;
            const lines = rawData.split("\n").filter(l => l.trim() && l !== "---");
            const rows: CustomRow[] = lines.map(line => {
              const parts = line.split("|").map(p => p.trim());
              return {
                Kanji: parts[0] || "",
                Kana: parts[1] || "",
                Romaji: parts[2] || "",
                Group: parts[3] || "",
                Meaning: parts[4] || "",
              };
            });

            built.push({ 
              id: `custom-${docId}`, 
              title: d.name || "Custom Dataset", 
              docId: docId, 
              creatorName: d.creatorName || "คุณ", // ✅ ดึงชื่อคนสร้าง
              rows 
            });
          } else {
             throw new Error("ไม่พบชุดข้อมูลในระบบ (อาจถูกลบไปแล้ว)");
          }
        }

        setSections(built);
      } catch (err: any) {
        setError(err?.message || "เกิดข้อผิดพลาดในการโหลดข้อมูลจาก Firebase");
      } finally {
        setLoading(false);
      }
    };

    fetchCustomData();
  }, [customParam, currentUser]);

  const onPrev = () => {
    setCurrent((i) => Math.max(0, i - 1));
    setIsAddingNew(false);
  };
  const onNext = () => {
    setCurrent((i) => Math.min(sections.length - 1, i + 1));
    setIsAddingNew(false);
  };

  const cur = sections[current];

  const handleSaveEdit = async () => {
    if (!editingRow || !editFormData || !cur) return;
    setIsSaving(true);

    const newRows = [...cur.rows];
    newRows[editingRow.rowIndex] = editFormData;

    const newDataString = newRows.map(w => 
      `${w.Kanji} | ${w.Kana} | ${w.Romaji} | ${w.Group} | ${w.Meaning}`
    ).join("\n");

    try {
      await updateDoc(doc(db, "custom_flashcards", cur.docId), { data: newDataString });
      
      const newSections = [...sections];
      newSections[editingRow.sectionIndex] = { ...cur, rows: newRows };
      setSections(newSections);
      
      setEditingRow(null);
      setEditFormData(null);
    } catch (error) {
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล (เช็คสิทธิ์ผู้ใช้งาน)");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddNewWord = async () => {
    if (!cur) return;
    if (!newWord.Meaning.trim() && !newWord.Kanji.trim() && !newWord.Kana.trim()) {
      alert("กรุณากรอกข้อมูลอย่างน้อย 1 ช่อง (เช่น ความหมาย)");
      return;
    }

    setIsSaving(true);
    const updatedRows = [...cur.rows, newWord];
    
    const newDataString = updatedRows.map(w => 
      `${w.Kanji} | ${w.Kana} | ${w.Romaji} | ${w.Group} | ${w.Meaning}`
    ).join("\n");

    try {
      await updateDoc(doc(db, "custom_flashcards", cur.docId), { data: newDataString });
      
      const newSections = [...sections];
      newSections[current] = { ...cur, rows: updatedRows };
      setSections(newSections);
      
      setNewWord({ Kanji: "", Kana: "", Romaji: "", Group: "", Meaning: "" });
      setIsAddingNew(false);
    } catch (error) {
      alert("เกิดข้อผิดพลาดในการเพิ่มคำศัพท์");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteWord = async (rowIndex: number) => {
    if (!cur || !confirm("ยืนยันการลบคำศัพท์นี้?")) return;

    setIsSaving(true);
    const newRows = cur.rows.filter((_, i) => i !== rowIndex);
    const newDataString = newRows.map(w => 
      `${w.Kanji} | ${w.Kana} | ${w.Romaji} | ${w.Group} | ${w.Meaning}`
    ).join("\n");

    try {
      await updateDoc(doc(db, "custom_flashcards", cur.docId), { data: newDataString });
      const newSections = [...sections];
      newSections[current] = { ...cur, rows: newRows };
      setSections(newSections);
    } catch (error) {
      alert("เกิดข้อผิดพลาดในการลบคำศัพท์");
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportExcel = () => {
    if (!cur || cur.rows.length === 0) {
      alert("ไม่มีข้อมูลสำหรับส่งออก");
      return;
    }

    const exportData = cur.rows.map(row => ({
      "Kanji": row.Kanji,
      "Hiragana/Katakana": row.Kana,
      "Romaji": row.Romaji,
      "Group": row.Group,
      "Meaning": row.Meaning
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Flashcards");

    const fileName = `${cur.title.replace(/\s+/g, '_')}_data.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <main className="max-w-6xl mx-auto p-6">
      <div className="mb-4">
        <Link href="/flashcards" className="text-sm underline text-indigo-600 font-medium">
          ← กลับไปหน้าเลือกบท (Custom Sets)
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-2 flex items-center gap-2 text-slate-800">
        <span className="text-[10px] font-black px-2 py-1 rounded-full bg-indigo-100 text-indigo-700">
          CUSTOM DATA
        </span>
        แก้ไขชุดคำศัพท์
      </h1>

      {loading && <div className="py-20 text-center text-indigo-400 font-bold animate-pulse">กำลังโหลดข้อมูลจาก Cloud...</div>}
      
      {error && (
        <div className="py-10 flex flex-col items-center justify-center gap-4 bg-rose-50 rounded-xl border border-rose-200 mt-4">
          <div className="text-rose-600 font-bold text-lg">{error}</div>
          <Link href="/flashcards" className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 font-bold text-sm shadow-sm">
            กลับไปหน้าหลัก
          </Link>
        </div>
      )}

      {!loading && !error && sections.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex overflow-x-auto gap-2 pr-2 pb-2 md:pb-0">
              {sections.map((s, idx) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setCurrent(idx);
                    setEditingRow(null);
                    setIsAddingNew(false);
                  }}
                  className={`shrink-0 rounded-lg border px-4 py-2 text-sm font-bold transition-colors ${idx === current ? "bg-indigo-600 text-white border-indigo-600 shadow-md" : "bg-white hover:bg-indigo-50 text-indigo-600 border-indigo-200"}`}
                >
                  {s.title}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <button onClick={onPrev} disabled={current <= 0} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-30">←</button>
              <span className="text-xs font-mono">{current + 1} / {sections.length}</span>
              <button onClick={onNext} disabled={current >= sections.length - 1} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-30">→</button>
            </div>
          </div>

          <div className="border border-indigo-100 rounded-xl bg-white shadow-sm overflow-hidden w-full">
            <div className="p-4 bg-indigo-50/80 border-b border-indigo-100 flex justify-between items-center flex-wrap gap-3">
              <div className="flex items-center gap-4 flex-wrap">
                {/* ✅ โชว์ชื่อคนสร้างในหัวข้อตารางด้วย */}
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-indigo-800">จัดการคำศัพท์ในชุด: {cur?.title}</span>
                  <span className="text-[10px] text-slate-500 font-medium">สร้างโดย: {cur?.creatorName}</span>
                </div>
                
                <label className="flex items-center gap-2 text-sm font-bold text-slate-600 cursor-pointer bg-white px-3 py-1.5 rounded-lg border shadow-sm hover:bg-slate-50 transition-colors">
                  <input 
                    type="checkbox" 
                    checked={showRomaji} 
                    onChange={e => setShowRomaji(e.target.checked)} 
                    className="w-4 h-4 accent-indigo-600 cursor-pointer" 
                  />
                  แสดง Romaji
                </label>
              </div>
              
              <div className="flex gap-2">
                <button onClick={handleExportExcel} className="text-xs px-4 py-2 rounded-lg font-bold transition-colors shadow-sm bg-blue-500 text-white hover:bg-blue-600">
                  📥 โหลดเป็น Excel
                </button>
                <button onClick={() => setIsAddingNew(!isAddingNew)} className={`text-xs px-4 py-2 rounded-lg font-bold transition-colors shadow-sm ${isAddingNew ? "bg-slate-200 text-slate-700 hover:bg-slate-300" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}>
                  {isAddingNew ? "ยกเลิกการเพิ่ม" : "+ เพิ่มคำศัพท์ใหม่"}
                </button>
              </div>
            </div>

            {isAddingNew && (
              <div className="p-4 bg-emerald-50/50 border-b border-emerald-100">
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
                  <div><div className="text-[10px] text-slate-500 font-bold mb-1">Kanji</div><input type="text" value={newWord.Kanji} onChange={(e) => setNewWord({...newWord, Kanji: e.target.value})} className="w-full p-2 border border-emerald-200 rounded text-sm outline-emerald-500" /></div>
                  <div><div className="text-[10px] text-slate-500 font-bold mb-1">Kana</div><input type="text" value={newWord.Kana} onChange={(e) => setNewWord({...newWord, Kana: e.target.value})} className="w-full p-2 border border-emerald-200 rounded text-sm outline-emerald-500" /></div>
                  <div><div className="text-[10px] text-slate-500 font-bold mb-1">Romaji</div><input type="text" value={newWord.Romaji} onChange={(e) => setNewWord({...newWord, Romaji: e.target.value})} className="w-full p-2 border border-emerald-200 rounded text-sm outline-emerald-500" /></div>
                  <div><div className="text-[10px] text-slate-500 font-bold mb-1">Group</div><input type="text" value={newWord.Group} onChange={(e) => setNewWord({...newWord, Group: e.target.value})} className="w-full p-2 border border-emerald-200 rounded text-sm outline-emerald-500" /></div>
                  <div className="col-span-2 md:col-span-1"><div className="text-[10px] text-rose-500 font-bold mb-1">ความหมาย *</div><input type="text" value={newWord.Meaning} onChange={(e) => setNewWord({...newWord, Meaning: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && handleAddNewWord()} className="w-full p-2 border border-emerald-200 rounded text-sm outline-emerald-500" /></div>
                  <div className="col-span-2 md:col-span-1"><button onClick={handleAddNewWord} disabled={isSaving} className="w-full py-2 bg-emerald-600 text-white rounded text-sm font-bold hover:bg-emerald-700 disabled:opacity-50">{isSaving ? "กำลังเซฟ..." : "บันทึกคำนี้"}</button></div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto w-full">
              <table className="min-w-full text-sm w-full">
                <thead className="bg-slate-50 border-b text-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold min-w-[120px] w-[15%] whitespace-nowrap">Kanji</th>
                    <th className="px-4 py-3 text-left font-semibold min-w-[120px] w-[15%] whitespace-nowrap">Hiragana/Katakana</th>
                    {showRomaji && <th className="px-4 py-3 text-left font-semibold min-w-[120px] w-[15%] whitespace-nowrap">Romaji</th>}
                    <th className="px-2 py-3 text-center font-semibold w-[70px]">Group</th>
                    <th className="px-4 py-3 text-left font-semibold w-auto">ความหมาย</th>
                    <th className="px-4 py-3 text-center font-semibold w-[100px]">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cur?.rows.length === 0 ? (
                    <tr>
                      <td colSpan={showRomaji ? 6 : 5} className="text-center py-10 text-slate-400 italic">ไม่มีคำศัพท์ในชุดข้อมูลนี้</td>
                    </tr>
                  ) : (
                    cur?.rows.map((r, i) => {
                      const isEditing = editingRow?.sectionIndex === current && editingRow?.rowIndex === i;

                      if (isEditing && editFormData) {
                        return (
                          <tr key={i} className="bg-indigo-50/40">
                            <td className="p-2"><input value={editFormData.Kanji} onChange={e => setEditFormData({...editFormData, Kanji: e.target.value})} className="w-full p-2 border border-indigo-300 rounded-lg outline-indigo-500 font-medium min-w-[100px]" /></td>
                            <td className="p-2"><input value={editFormData.Kana} onChange={e => setEditFormData({...editFormData, Kana: e.target.value})} className="w-full p-2 border border-indigo-300 rounded-lg outline-indigo-500 font-medium min-w-[100px]" /></td>
                            {showRomaji && <td className="p-2"><input value={editFormData.Romaji} onChange={e => setEditFormData({...editFormData, Romaji: e.target.value})} className="w-full p-2 border border-indigo-300 rounded-lg outline-indigo-500 font-mono min-w-[100px]" /></td>}
                            <td className="p-2"><input value={editFormData.Group} onChange={e => setEditFormData({...editFormData, Group: e.target.value})} className="w-full p-2 border border-indigo-300 rounded-lg text-center outline-indigo-500 font-bold" /></td>
                            <td className="p-2"><input value={editFormData.Meaning} onChange={e => setEditFormData({...editFormData, Meaning: e.target.value})} className="w-full p-2 border border-indigo-300 rounded-lg outline-indigo-500 font-medium min-w-[150px]" /></td>
                            <td className="p-2 flex items-center justify-center gap-1">
                              <button onClick={handleSaveEdit} disabled={isSaving} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50">
                                {isSaving ? "รอ.." : "บันทึก"}
                              </button>
                              <button onClick={() => setEditingRow(null)} disabled={isSaving} className="px-3 py-1.5 bg-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-300">
                                ยกเลิก
                              </button>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={i} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-4 py-3 font-medium text-slate-900 text-[15px] break-keep">{r.Kanji || "-"}</td>
                          <td className="px-4 py-3 text-slate-600 text-[15px] break-keep">{r.Kana || "-"}</td>
                          {showRomaji && <td className="px-4 py-3 text-slate-500 italic break-keep">{r.Romaji || "-"}</td>}
                          <td className="px-4 py-3 text-center">
                            {r.Group && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-black whitespace-nowrap">{r.Group}</span>}
                          </td>
                          <td className="px-4 py-3 text-slate-700">{r.Meaning}</td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-2 opacity-20 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => {
                                  setEditingRow({ sectionIndex: current, rowIndex: i });
                                  setEditFormData({ ...r });
                                  setIsAddingNew(false);
                                }}
                                className="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs rounded hover:bg-indigo-200 font-bold"
                              >
                                แก้ไข
                              </button>
                              <button 
                                onClick={() => handleDeleteWord(i)}
                                disabled={isSaving}
                                className="px-3 py-1 bg-rose-100 text-rose-600 text-xs rounded hover:bg-rose-200 font-bold disabled:opacity-50"
                              >
                                ลบ
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}