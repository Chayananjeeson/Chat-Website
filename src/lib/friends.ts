// src/lib/friends.ts
import { db } from "@/lib/firebase";
import {
  addDoc, collection, doc, getDoc, getDocs, query, where, serverTimestamp,
} from "firebase/firestore";

export async function findUidByUsername(username: string) {
  const d = await getDoc(doc(db, "usernames", username));
  if (!d.exists()) return null;
  const uid = (d.data() as any)?.uid;
  return uid || null;
}

// ใช้สำหรับตั้งชื่อเอกสารต่าง ๆ ถ้าจำเป็น
export function pairId(a: string, b: string) {
  return [a, b].sort().join("_");
}

// ✅ แก้: อย่า getDoc(fid) เพราะจะโดน rules ถ้า doc ยังไม่สร้าง
export async function isAlreadyFriends(uidA: string, uidB: string) {
  const q = query(
    collection(db, "friendships"),
    where("participants", "array-contains", uidA)
  );
  const snap = await getDocs(q);
  return snap.docs.some((d) => {
    const ps = ((d.data() as any)?.participants || []) as string[];
    return ps.includes(uidB);
  });
}

export async function hasPendingRequest(uidA: string, uidB: string) {
  const q1 = query(
    collection(db, "friendRequests"),
    where("fromUid", "==", uidA),
    where("toUid", "==", uidB),
    where("status", "==", "pending")
  );
  const q2 = query(
    collection(db, "friendRequests"),
    where("fromUid", "==", uidB),
    where("toUid", "==", uidA),
    where("status", "==", "pending")
  );
  const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);
  return !s1.empty || !s2.empty;
}

export async function sendFriendRequest(fromUid: string, toUid: string) {
  await addDoc(collection(db, "friendRequests"), {
    fromUid,
    toUid,
    status: "pending",
    createdAt: serverTimestamp(),
  });
}
