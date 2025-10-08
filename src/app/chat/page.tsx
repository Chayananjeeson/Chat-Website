"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection, doc, getDoc, onSnapshot, query, where, orderBy,
} from "firebase/firestore";
import ProfileBar from "@/components/ProfileBar";

type UserRow = {
  uid: string;
  displayName?: string;
  username?: string;
  email?: string;
  photoURL?: string;
};

type GroupMeta = {
  id: string;
  name?: string;
  photoURL?: string | null;
  participants: string[];
  type: "group";
};

export default function ChatHome() {
  const router = useRouter();
  const [meUid, setMeUid] = useState<string | null>(null);

  // เพื่อน (DM)
  const [friends, setFriends] = useState<string[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);

  // กลุ่ม
  const [groups, setGroups] = useState<GroupMeta[]>([]);

  // unread ต่อห้อง (ทั้ง DM และ Group)
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({}); // cid -> count

  // จำนวนคำขอเป็นเพื่อนค้างอยู่
  const [pendingReqCount, setPendingReqCount] = useState(0);

  /* ========== auth + ตรวจ username + subscribe รายชื่อเพื่อน ========== */
  useEffect(() => {
    const off = onAuthStateChanged(auth, async (u) => {
      if (!u) { router.replace("/login"); return; }
      setMeUid(u.uid);

      const meDoc = await getDoc(doc(db, "users", u.uid));
      if (!meDoc.exists() || !meDoc.data()?.username) {
        router.replace("/setup-username");
        return;
      }

      // friendships ของเรา
      const qf = query(
        collection(db, "friendships"),
        where("participants", "array-contains", u.uid)
      );
      const unsubF = onSnapshot(qf, (snap) => {
        const otherUids: string[] = [];
        snap.forEach(d => {
          const ps = (d.data() as any).participants as string[];
          const other = ps.find(x => x !== u.uid);
          if (other) otherUids.push(other);
        });
        setFriends(otherUids);
      });

      // groups ที่เราเป็นสมาชิก
      const qg = query(
        collection(db, "conversations"),
        where("type", "==", "group"),
        where("participants", "array-contains", u.uid)
      );
      const unsubG = onSnapshot(qg, (s) => {
        const list = s.docs.map(d => ({ id: d.id, ...(d.data() as any) } as GroupMeta));
        setGroups(list);
      });

      // ===== จำนวน "คำขอเป็นเพื่อน" ค้างอยู่ =====
      // ใช้คอลเลกชัน friendRequests และฟิลด์ toUid ตาม rules
      const qr = query(
        collection(db, "friendRequests"),
        where("toUid", "==", u.uid)
      );
      const unsubR = onSnapshot(qr, (s) => {
        // นับเฉพาะที่สถานะเป็น "pending" หรือไม่มีฟิลด์ status (ถือว่า pending)
        const count = s.docs.filter((d) => {
          const st = (d.data() as any).status ?? "pending";
          return st === "pending";
        }).length;
        setPendingReqCount(count);
      });

      return () => { unsubF(); unsubG(); unsubR(); };
    });
    return () => off();
  }, [router]);

  /* ========== โหลดโปรไฟล์ users ของเพื่อน (DM list) ========== */
  useEffect(() => {
    if (!meUid) return;
    if (friends.length === 0) { setUsers([]); return; }

    const unsubs: (() => void)[] = [];
    const map = new Map<string, UserRow>();

    friends.forEach((uid) => {
      const uref = doc(db, "users", uid);
      const u = onSnapshot(uref, (d) => {
        if (d.exists()) map.set(uid, { uid, ...(d.data() as any) });
        else map.delete(uid);
        setUsers(
          Array.from(map.values()).sort((a,b) => (a.displayName||"").localeCompare(b.displayName||""))
        );
      });
      unsubs.push(u);
    });

    return () => unsubs.forEach(fn => fn());
  }, [friends.join(","), meUid]);

  /* ========== helper: subscribe unread ของห้องหนึ่ง ========== */
  const watchUnreadForConv = (cid: string) => {
    if (!meUid) return () => {};
    let lastReadAt: any = null;

    const offRead = onSnapshot(doc(db, "conversations", cid, "reads", meUid), (snap) => {
      lastReadAt = (snap.data() as any)?.lastReadAt || null;
    });

    const offMsg = onSnapshot(
      query(collection(db, "conversations", cid, "messages"), orderBy("createdAt", "asc")),
      (snap) => {
        const lr = lastReadAt?.toMillis ? lastReadAt.toMillis() : 0;
        let count = 0;
        snap.forEach((d) => {
          const m = d.data() as any;
          const t = m.createdAt?.toMillis ? m.createdAt.toMillis() : 0;
          const isOther = m.uid && m.uid !== meUid;
          if (isOther && t > lr) count++;
        });
        setUnreadMap((prev) => ({ ...prev, [cid]: count }));
      }
    );

    return () => { offRead(); offMsg(); };
  };

  /* ========== subscribe unread ทั้ง DM และ Group ========== */
  useEffect(() => {
    if (!meUid) return;
    const cleaners: (() => void)[] = [];

    // DM
    friends.forEach((otherUid) => {
      const cid = [meUid, otherUid].sort().join("_");
      cleaners.push(watchUnreadForConv(cid));
    });

    // Groups
    groups.forEach((g) => cleaners.push(watchUnreadForConv(g.id)));

    return () => cleaners.forEach(fn => fn());
  }, [meUid, friends.join(","), groups.map(g => g.id).join(",")]);

  const convIdWith = (otherUid: string) => [meUid!, otherUid].sort().join("_");

  return (
    <main className="max-w-3xl mx-auto p-6">
      <ProfileBar />

      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-semibold">เพื่อนของฉัน</h1>

        {/* ปุ่มไปหน้า Flashcards */}
        <Link
          href="/flashcards"
          className="ml-auto px-3 py-1.5 rounded-lg border bg-amber-100 hover:bg-amber-200 text-sm"
          title="เรียนคำศัพท์ภาษาญี่ปุ่น (Flashcards)"
        >
          📚 Flashcards
        </Link>

        <Link href="/groups/new" className="text-sm underline">สร้างกลุ่ม</Link>

        {/* ลิงก์จัดการเพื่อน + badge จำนวนคำขอค้าง */}
        <Link href="/friends" className="relative text-sm underline">
          จัดการเพื่อน
          {pendingReqCount > 0 && (
            <span className="absolute -top-2 -right-3 text-[10px] bg-red-600 text-white rounded-full px-[6px] py-[1px] leading-5 min-w-[18px] text-center">
              {pendingReqCount}
            </span>
          )}
        </Link>
      </div>

      <ul className="space-y-3">
        {users.map((u) => {
          const cid = convIdWith(u.uid);
          const unread = unreadMap[cid] || 0;
          return (
            <li key={u.uid} className="flex items-center justify-between border rounded-xl px-4 py-2 bg-white">
              <div className="flex items-center gap-3">
                {u.photoURL ? (
                  <img src={u.photoURL} alt={u.displayName || u.username || u.email || "ผู้ใช้"} className="w-10 h-10 rounded-full object-cover border" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-medium text-white">
                    {(u.displayName?.[0] || u.username?.[0] || u.email?.[0] || "👤").toString().toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="font-medium">{u.displayName || "(ไม่มีชื่อที่แสดง)"}</div>
                  <div className="text-xs text-slate-500">{u.username ? `@${u.username}` : u.email}</div>
                </div>
              </div>

              <Link href={`/chat/${cid}`} className="relative px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm">
                แชท
                {unread > 0 && (
                  <span className="absolute -top-2 -right-2 text-[10px] bg-red-600 text-white rounded-full px-[6px] py-[1px] leading-5 min-w-[20px] text-center">
                    {unread}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
        {users.length === 0 && (
          <li className="text-slate-500 text-sm">
            ยังไม่มีเพื่อน – ไปที่ <Link href="/friends" className="underline">หน้าเพิ่มเพื่อน</Link> ก่อนนะ
          </li>
        )}
      </ul>

      <hr className="my-8" />

      <h2 className="text-xl font-semibold mb-3">กลุ่มของฉัน</h2>
      <ul className="space-y-3">
        {groups.map((g) => {
          const unread = unreadMap[g.id] || 0;
          return (
            <li key={g.id} className="flex items-center justify-between border rounded-xl px-4 py-2 bg-white">
              <div className="flex items-center gap-3">
                {g.photoURL ? (
                  <img src={g.photoURL} alt={g.name || "group"} className="w-10 h-10 rounded-full object-cover border" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-medium text-white">
                    {(g.name?.[0] || "G").toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="font-medium">{g.name || "(ไม่มีชื่อกลุ่ม)"}</div>
                  <div className="text-xs text-slate-500">สมาชิก {g.participants?.length || 0} คน</div>
                </div>
              </div>

              <Link href={`/chat/${g.id}`} className="relative px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm">
                แชท
                {unread > 0 && (
                  <span className="absolute -top-2 -right-2 text-[10px] bg-red-600 text-white rounded-full px-[6px] py-[1px] leading-5 min-w-[20px] text-center">
                    {unread}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
        {groups.length === 0 && <li className="text-slate-500 text-sm">ยังไม่มีกลุ่ม</li>}
      </ul>
    </main>
  );
}
