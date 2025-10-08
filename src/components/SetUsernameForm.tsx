"use client";
import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { useRouter } from "next/navigation";

const VALID = /^[A-Za-z]{1,10}$/;

export default function SetUsernameForm() {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const user = auth.currentUser;
    if (!user) return setErr("กรุณาเข้าสู่ระบบก่อน");
    const uname = name.trim();

    if (!VALID.test(uname)) {
      return setErr("ใส่ได้เฉพาะ a–z / A–Z ยาว 1–10 ตัว");
    }

    setBusy(true);
    try {
      await runTransaction(db, async (tx) => {
        const unameRef = doc(db, "usernames", uname.toLowerCase());
        const userRef  = doc(db, "users", user.uid);

        // ✅ อ่านให้ครบก่อน (ทุก read มาก่อน write)
        const unameSnap = await tx.get(unameRef);
        const userSnap  = await tx.get(userRef);

        if (unameSnap.exists()) {
          throw new Error("ชื่อนี้ถูกใช้แล้ว");
        }

        // ✅ เขียนหลังจากอ่านครบ
        tx.set(unameRef, { uid: user.uid });

        // ใช้ merge เพื่อไม่ต้องเช็คมีเอกสารหรือยัง
        tx.set(
          userRef,
          {
            email: user.email ?? "",
            username: uname,
            createdAt: userSnap.exists() ? userSnap.data()?.createdAt ?? serverTimestamp() : serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      });

      router.replace("/chat");
    } catch (e: any) {
      setErr(e?.message ?? "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 max-w-sm w-full">
      <label className="block text-sm text-slate-600">
        ตั้งชื่อผู้ใช้ (a–z/A–Z, 1–10 ตัว)
      </label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full border rounded-xl px-3 py-2"
        placeholder="เช่น ken, Bank"
        maxLength={10}
      />
      {err && <p className="text-red-600 text-sm">{err}</p>}
      <button disabled={busy} className="w-full rounded-xl px-4 py-2 bg-blue-600 text-white">
        {busy ? "กำลังบันทึก..." : "บันทึกชื่อผู้ใช้"}
      </button>
    </form>
  );
}
