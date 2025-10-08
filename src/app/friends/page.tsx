// src/app/friends/page.tsx
"use client";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import {
  collection, deleteDoc, doc, onSnapshot, query, serverTimestamp,
  updateDoc, where, setDoc
} from "firebase/firestore";
import {
  findUidByUsername, hasPendingRequest, isAlreadyFriends, pairId, sendFriendRequest
} from "@/lib/friends";
import { onAuthStateChanged, User } from "firebase/auth";

type Req = { id: string; fromUid: string; toUid: string; status: "pending"|"accepted"|"declined" };
type FriendDoc = { id: string; participants: string[] };

export default function FriendsPage() {
  const [me, setMe] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [incoming, setIncoming] = useState<Req[]>([]);
  const [outgoing, setOutgoing] = useState<Req[]>([]);
  const [friends,  setFriends]  = useState<FriendDoc[]>([]);

  // ✅ userMap: uid → {username, displayName}
  const [userMap, setUserMap] = useState<Record<string, {username?: string, displayName?: string}>>({});

  // รอ auth
  useEffect(() => {
    const off = onAuthStateChanged(auth, (u) => {
      setMe(u);
      setAuthReady(true);
    });
    return () => off();
  }, []);

  // subscribe users ทั้งหมดเพื่อ map uid → username/displayName
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const m: Record<string, {username?: string, displayName?: string}> = {};
      snap.docs.forEach(d => {
        const data = d.data() as any;
        m[d.id] = { username: data.username, displayName: data.displayName };
      });
      setUserMap(m);
    });
    return () => unsub();
  }, []);

  // subscribe incoming/outgoing
  useEffect(() => {
    if (!authReady || !me) return;
    const qIn  = query(collection(db, "friendRequests"),
      where("toUid", "==", me.uid), where("status", "==", "pending"));
    const qOut = query(collection(db, "friendRequests"),
      where("fromUid", "==", me.uid), where("status", "==", "pending"));
    const u1 = onSnapshot(qIn,  s => setIncoming(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
    const u2 = onSnapshot(qOut, s => setOutgoing(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
    return () => { u1(); u2(); };
  }, [authReady, me?.uid]);

  // subscribe friendships
  useEffect(() => {
    if (!authReady || !me) return;
    const qf = query(collection(db, "friendships"),
      where("participants", "array-contains", me.uid));
    const u = onSnapshot(qf, s => setFriends(s.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
    return () => u();
  }, [authReady, me?.uid]);

  const friendUids = useMemo(() => {
    if (!me) return new Set<string>();
    const set = new Set<string>();
    friends.forEach(f => f.participants.forEach(p => { if (p !== me.uid) set.add(p); }));
    return set;
  }, [friends, me?.uid]);

  const onAdd = async () => {
    try {
      setError(null);
      if (!me) { setError("กรุณาเข้าสู่ระบบ"); return; }

      const name = username.trim();
      if (!name) return;

      const toUid = await findUidByUsername(name);
      if (!toUid) { setError("ไม่พบ username นี้"); return; }
      if (toUid === me.uid) { setError("ห้ามแอดตัวเอง"); return; }

      if (await isAlreadyFriends(me.uid, toUid)) { setError("เป็นเพื่อนกันอยู่แล้ว"); return; }
      if (await hasPendingRequest(me.uid, toUid)) { setError("มีคำขอที่ค้างอยู่แล้ว"); return; }

      await sendFriendRequest(me.uid, toUid);
      setUsername("");
    } catch (e: any) {
      console.error("Add friend error:", e);
      setError(`${e.code || "permission-denied"} ${e.message || e}`);
    }
  };

  const onAccept = async (r: Req) => {
    if (!me) return;
    await updateDoc(doc(db, "friendRequests", r.id), { status: "accepted" });
    const fid = pairId(r.fromUid, r.toUid);
    await setDoc(doc(db, "friendships", fid), {
      participants: [r.fromUid, r.toUid].sort(),
      createdAt: serverTimestamp(),
      createdBy: me.uid,
    });
  };

  const onDecline = async (rid: string) => {
    await updateDoc(doc(db, "friendRequests", rid), { status: "declined" });
  };

  const onRemove = async (otherUid: string) => {
    if (!me) return;
    const fid = pairId(me.uid, otherUid);
    await deleteDoc(doc(db, "friendships", fid));
  };

  const renderName = (uid: string) => {
    return userMap[uid]?.username || userMap[uid]?.displayName || uid;
  };

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">จัดการเพื่อน</h1>

      <section>
        <h2 className="font-medium mb-2">แอดเพื่อนด้วย username</h2>
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2"
            placeholder="พิมพ์ username เช่น ken"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === "Enter" && onAdd()}
            disabled={!authReady}
          />
          <button onClick={onAdd} className="px-4 py-2 rounded-lg bg-blue-600 text-white" disabled={!authReady}>
            Add
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        {!authReady && <p className="text-sm text-slate-500 mt-2">กำลังโหลดผู้ใช้…</p>}
      </section>

      <section>
        <h2 className="font-medium mb-2">คำขอที่รออนุมัติ (เข้ามา)</h2>
        <ul className="space-y-2">
          {incoming.map(r => (
            <li key={r.id} className="flex items-center justify-between border rounded-lg px-3 py-2 bg-white">
              <span className="text-sm">จาก: {renderName(r.fromUid)}</span>
              <div className="flex gap-2">
                <button onClick={() => onAccept(r)} className="px-3 py-1.5 rounded bg-green-600 text-white text-sm">ยอมรับ</button>
                <button onClick={() => onDecline(r.id)} className="px-3 py-1.5 rounded bg-slate-200 text-sm">ปฏิเสธ</button>
              </div>
            </li>
          ))}
          {incoming.length === 0 && <li className="text-sm text-slate-500">ยังไม่มีคำขอ</li>}
        </ul>
      </section>

      <section>
        <h2 className="font-medium mb-2">คำขอที่ฉันส่งออก</h2>
        <ul className="space-y-2">
          {outgoing.map(r => (
            <li key={r.id} className="flex items-center justify-between border rounded-lg px-3 py-2 bg-white">
              <span className="text-sm">ถึง: {renderName(r.toUid)}</span>
              <span className="text-xs text-slate-500">{r.status}</span>
            </li>
          ))}
          {outgoing.length === 0 && <li className="text-sm text-slate-500">ยังไม่มี</li>}
        </ul>
      </section>

      <section>
        <h2 className="font-medium mb-2">เพื่อนของฉัน</h2>
        <ul className="space-y-2">
          {[...friendUids].map((uid) => (
            <li key={uid} className="flex items-center justify-between border rounded-lg px-3 py-2 bg-white">
              <span className="text-sm">{renderName(uid)}</span>
              <button onClick={() => onRemove(uid)} className="px-3 py-1.5 rounded bg-rose-600 text-white text-sm">
                ลบเพื่อน
              </button>
            </li>
          ))}
          {friendUids.size === 0 && <li className="text-sm text-slate-500">ยังไม่มีเพื่อน</li>}
        </ul>
      </section>
    </main>
  );
}