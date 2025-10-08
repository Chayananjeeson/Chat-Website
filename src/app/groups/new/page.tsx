"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db, storage } from "@/lib/firebase";
import {
  collection, doc, onSnapshot, query, where, setDoc, serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

type Friend = { uid: string; displayName?: string; username?: string; photoURL?: string };

export default function NewGroupPage() {
  const router = useRouter();
  const me = auth.currentUser;
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // โหลดเพื่อนจาก friendships
  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;
    const qf = query(collection(db, "friendships"), where("participants", "array-contains", u.uid));
    const unsub = onSnapshot(qf, async (snap) => {
      const uids = new Set<string>();
      snap.docs.forEach((d) => (d.data() as any).participants?.forEach((p: string) => p !== u.uid && uids.add(p)));
      // โหลดโปรไฟล์
      const list: Friend[] = [];
      const gets = [...uids].map(async (uid) => {
        const r = await (await import("firebase/firestore")).getDoc(doc(db, "users", uid));
        const d = r.data() as any;
        list.push({ uid, displayName: d?.displayName, username: d?.username, photoURL: d?.photoURL });
      });
      await Promise.all(gets);
      setFriends(list);
    });
    return () => unsub();
  }, []);

  const toggle = (uid: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(uid) ? n.delete(uid) : n.add(uid);
      return n;
    });

  const onCreate = async () => {
    setErr(null);
    if (!me) return;
    const members = [me.uid, ...selected];
    if (!name.trim()) { setErr("กรุณาตั้งชื่อกลุ่ม"); return; }
    if (members.length < 2) { setErr("เลือกอย่างน้อย 1 คน"); return; }

    try {
      setCreating(true);
      // ใช้ doc id อัตโนมัติ
      const convRef = doc(collection(db, "conversations"));
      let photoURL: string | undefined;

      if (file) {
        const p = `groups/${convRef.id}/avatar_${Date.now()}.jpg`;
        const snap = await uploadBytes(ref(storage, p), file);
        photoURL = await getDownloadURL(snap.ref);
      }

      await setDoc(convRef, {
        type: "group",
        name: name.trim(),
        photoURL: photoURL || null,
        participants: members,
        admins: [me.uid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessage: "",
      });

      router.replace(`/chat/${convRef.id}`);
    } catch (e: any) {
      console.error(e);
      setErr(e.message || "สร้างกลุ่มไม่สำเร็จ");
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="max-w-xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">สร้างกลุ่มใหม่</h1>

      <label className="block">
        <span className="text-sm text-slate-600">ชื่อกลุ่ม</span>
        <input
          className="mt-1 w-full border rounded-lg px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="เช่น เพื่อนรุ่น 6/2"
        />
      </label>

      <label className="block">
        <span className="text-sm text-slate-600">รูปกลุ่ม (ไม่บังคับ)</span>
        <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </label>

      <section>
        <h2 className="font-medium mb-2">เลือกสมาชิก</h2>
        <ul className="space-y-2">
          {friends.map((f) => (
            <li key={f.uid} className="flex items-center justify-between border rounded-lg px-3 py-2 bg-white">
              <div className="flex items-center gap-3">
                {f.photoURL ? (
                  <img src={f.photoURL} className="w-9 h-9 rounded-full object-cover border" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-xs text-white">
                    {(f.displayName?.[0] || f.username?.[0] || "👤").toString().toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="font-medium">{f.displayName || "(ไม่มีชื่อแสดง)"}</div>
                  <div className="text-xs text-slate-500">{f.username ? `@${f.username}` : f.uid}</div>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(f.uid)}
                  onChange={() => toggle(f.uid)}
                />
                เลือก
              </label>
            </li>
          ))}
          {friends.length === 0 && <li className="text-sm text-slate-500">ยังไม่มีเพื่อน</li>}
        </ul>
      </section>

      {err && <p className="text-sm text-rose-600">{err}</p>}

      <button
        onClick={onCreate}
        disabled={creating}
        className="px-4 py-2 rounded-lg bg-blue-600 text-white disabled:opacity-60"
      >
        {creating ? "กำลังสร้าง…" : "สร้างกลุ่ม"}
      </button>
    </main>
  );
}
