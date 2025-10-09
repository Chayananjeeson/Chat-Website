"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  orderBy,
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

type Unsub = () => void;
const addUnsub = (fn: Unsub) => {
  const g = globalThis as unknown as { firebaseUnsubs?: Unsub[] };
  g.firebaseUnsubs = g.firebaseUnsubs || [];
  g.firebaseUnsubs.push(fn);
};

export default function ChatHome() {
  const router = useRouter();
  const [meUid, setMeUid] = useState<string | null>(null);
  const [friends, setFriends] = useState<string[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [groups, setGroups] = useState<GroupMeta[]>([]);
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const [pendingReqCount, setPendingReqCount] = useState(0);

  // auth + subscribe หลัก
  useEffect(() => {
    let innerUnsubs: Unsub[] = [];

    const off = onAuthStateChanged(auth, async (u) => {
      innerUnsubs.forEach((fn) => fn());
      innerUnsubs = [];

      if (!u) {
        setMeUid(null);
        setFriends([]);
        setUsers([]);
        setGroups([]);
        setUnreadMap({});
        router.replace("/login");
        return;
      }
      setMeUid(u.uid);

      const meDoc = await getDoc(doc(db, "users", u.uid));
      if (!meDoc.exists() || !meDoc.data()?.username) {
        router.replace("/setup-username");
        return;
      }

      const qf = query(
        collection(db, "friendships"),
        where("participants", "array-contains", u.uid)
      );
      const unsubF = onSnapshot(
        qf,
        (snap) => {
          const otherUids: string[] = [];
          snap.forEach((d) => {
            const ps = (d.data() as any).participants as string[];
            const other = ps.find((x) => x !== u.uid);
            if (other) otherUids.push(other);
          });
          setFriends(otherUids);
        },
        (err) => {
          if (err?.code !== "permission-denied")
            console.error("friendships snapshot error:", err);
        }
      );
      innerUnsubs.push(unsubF);
      addUnsub(unsubF);

      const qg = query(
        collection(db, "conversations"),
        where("type", "==", "group"),
        where("participants", "array-contains", u.uid)
      );
      const unsubG = onSnapshot(
        qg,
        (s) => {
          const list = s.docs.map(
            (d) => ({ id: d.id, ...(d.data() as any) } as GroupMeta)
          );
          setGroups(list);
        },
        (err) => {
          if (err?.code !== "permission-denied")
            console.error("groups snapshot error:", err);
        }
      );
      innerUnsubs.push(unsubG);
      addUnsub(unsubG);

      const qr = query(
        collection(db, "friendRequests"),
        where("toUid", "==", u.uid)
      );
      const unsubR = onSnapshot(
        qr,
        (s) => {
          const count = s.docs.filter((d) => {
            const st = (d.data() as any).status ?? "pending";
            return st === "pending";
          }).length;
          setPendingReqCount(count);
        },
        (err) => {
          if (err?.code !== "permission-denied")
            console.error("friendRequests snapshot error:", err);
        }
      );
      innerUnsubs.push(unsubR);
      addUnsub(unsubR);
    });

    return () => {
      off();
      innerUnsubs.forEach((fn) => fn());
    };
  }, [router]);

  // โหลดโปรไฟล์เพื่อน
  useEffect(() => {
    if (!meUid) return;
    if (friends.length === 0) {
      setUsers([]);
      return;
    }

    const unsubs: Unsub[] = [];
    const map = new Map<string, UserRow>();

    friends.forEach((uid) => {
      const uref = doc(db, "users", uid);
      const unsub = onSnapshot(
        uref,
        (d) => {
          if (d.exists()) map.set(uid, { uid, ...(d.data() as any) });
          else map.delete(uid);
          setUsers(
            Array.from(map.values()).sort((a, b) =>
              (a.displayName || "").localeCompare(b.displayName || "")
            )
          );
        },
        (err) => {
          if (err?.code !== "permission-denied")
            console.error("user snapshot error:", err);
        }
      );
      unsubs.push(unsub);
      addUnsub(unsub);
    });

    return () => unsubs.forEach((fn) => fn());
  }, [friends.join(","), meUid]);

  // helper
  const convIdWith = (otherUid: string) =>
    [meUid!, otherUid].sort().join("_");

  return (
    <main className="max-w-3xl mx-auto p-6">
      {/* 👉 ProfileBar กลับมาตำแหน่งเดิม */}
      <ProfileBar />

      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-2xl font-semibold">เพื่อนของฉัน</h1>

        <Link
          href="/flashcards"
          className="ml-auto px-3 py-1.5 rounded-lg border bg-amber-100 hover:bg-amber-200 text-sm"
          title="เรียนคำศัพท์ภาษาญี่ปุ่น (Flashcards)"
        >
          📚 Flashcards
        </Link>

        <Link href="/groups/new" className="text-sm underline">สร้างกลุ่ม</Link>

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
          return (
            <li key={u.uid} className="flex items-center justify-between border rounded-xl px-4 py-2 bg-white">
              <div className="flex items-center gap-3">
                {u.photoURL ? (
                  <img src={u.photoURL} alt={u.displayName || u.username || u.email || "ผู้ใช้"}
                       className="w-10 h-10 rounded-full object-cover border" />
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
              </Link>
            </li>
          );
        })}
      </ul>

      <hr className="my-8" />

      <h2 className="text-xl font-semibold mb-3">กลุ่มของฉัน</h2>
      <ul className="space-y-3">
        {groups.map((g) => (
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

            <Link href={`/chat/${g.id}`} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm">
              แชท
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
