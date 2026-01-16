// src/lib/call-room.ts
import { db } from "@/lib/firebase";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

export type CallStatus = "idle" | "ringing" | "active";

export type CallDoc = {
  status: CallStatus;

  // เพิ่มทุกครั้งที่ต้อง renegotiate ใหม่ (เพื่อให้กลับเข้าห้องได้)
  seq: number;

  createdAt?: any;
  updatedAt?: any;

  // “ใครเป็นคนกดโทรเรียก” (ใช้โชว์ incoming)
  ring?: { fromUid: string; toUid: string; at: any; seq: number } | null;

  // สัญญาณ WebRTC (ถูกผูกกับ seq)
  offer?: { type: "offer"; sdp: string; uid: string; seq: number } | null;
  answer?: { type: "answer"; sdp: string; uid: string; seq: number } | null;

  // ขอให้ฝั่ง offerer สร้าง offer ใหม่ (เวลาคนเข้าใหม่/กลับเข้า)
  reofferRequest?: { uid: string; at: any; seq: number } | null;

  // สมาชิกในห้อง: joinedAt/leftAt เอาไว้ดูว่า “ยังอยู่ในห้องไหม”
  members?: Record<string, { joinedAt?: any; leftAt?: any; muted?: boolean }>;
};

export function callRef(cid: string) {
  return doc(db, "conversations", cid, "calls", "main");
}

export async function ensureCallRoom(cid: string) {
  const ref = callRef(cid);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const init: CallDoc = {
      status: "idle",
      seq: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ring: null,
      offer: null,
      answer: null,
      reofferRequest: null,
      members: {},
    };
    await setDoc(ref, init, { merge: true });
  }

  return ref;
}

/** ตัวช่วย: ให้ offerer “ตายตัว” กันชน race (uid ตัวเล็กเป็น offerer) */
export function pickOffererUid(a: string, b: string) {
  return [a, b].sort()[0];
}

/** ตัวช่วย: member ยัง active ไหม */
export function isMemberActive(m?: { joinedAt?: any; leftAt?: any }) {
  const j = m?.joinedAt?.toMillis ? m.joinedAt.toMillis() : 0;
  const l = m?.leftAt?.toMillis ? m.leftAt.toMillis() : 0;
  return j > 0 && l < j;
}
