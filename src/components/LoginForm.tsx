"use client";

import { useState } from "react";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";
import { useRouter, useSearchParams } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

type Mode = "login" | "signup";

function tError(code?: string) {
  switch (code) {
    case "auth/invalid-email": return "อีเมลไม่ถูกต้อง";
    case "auth/user-disabled": return "ผู้ใช้งานนี้ถูกปิดใช้งาน";
    case "auth/user-not-found": return "ไม่พบบัญชีผู้ใช้นี้";
    case "auth/wrong-password": return "รหัสผ่านไม่ถูกต้อง";
    case "auth/email-already-in-use": return "อีเมลนี้ถูกใช้งานแล้ว";
    case "auth/weak-password": return "รหัสผ่านสั้นเกินไป";
    case "auth/popup-closed-by-user": return "ปิดหน้าต่าง Google ก่อนสำเร็จการล็อกอิน";
    default: return "เกิดข้อผิดพลาด กรุณาลองใหม่";
  }
}

export default function LoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const nextPath = sp.get("next") || "/chat";

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const clearAlerts = () => { setMsg(null); setErr(null); };

  const ensureUserDoc = async (
    uid: string,
    email?: string | null,
    displayName?: string | null,
    photoURL?: string | null
  ) => {
    const ref = doc(db, "users", uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid,
        email: email || "",
        displayName: displayName || "",
        photoURL: photoURL || "",
        createdAt: new Date(),
      });
    }
  };

  // email/password
  const onSubmitEmailPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearAlerts();
    setBusy(true);
    try {
      if (mode === "login") {
        const res = await signInWithEmailAndPassword(auth, email.trim(), pass);
        await ensureUserDoc(res.user.uid, res.user.email, res.user.displayName, res.user.photoURL);
      } else {
        const res = await createUserWithEmailAndPassword(auth, email.trim(), pass);
        await ensureUserDoc(res.user.uid, res.user.email, res.user.displayName, res.user.photoURL);
      }
      router.replace(nextPath);
    } catch (e: any) {
      setErr(tError(e?.code));
    } finally {
      setBusy(false);
    }
  };

  // reset password
  const onResetPassword = async () => {
    clearAlerts();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr("กรุณากรอกอีเมลรูปแบบที่ถูกต้อง (name@example.com)");
      return;
    }
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim(), {
        url: `${window.location.origin}/login?reset=1`,
        handleCodeInApp: false,
      });
      setMsg("ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว หากอีเมลนี้มีอยู่ในระบบ โปรดตรวจสอบกล่องจดหมาย/สแปม");
    } catch (e: any) {
      // ปิดบัง user-not-found เพื่อความปลอดภัย
      if (e?.code === "auth/user-not-found") {
        setMsg("ส่งลิงก์รีเซ็ตรหัสผ่านแล้ว หากอีเมลนี้มีอยู่ในระบบ โปรดตรวจสอบกล่องจดหมาย/สแปม");
      } else {
        setErr(tError(e?.code));
      }
    } finally {
      setBusy(false);
    }
  };

  // google
  const onLoginWithGoogle = async () => {
    clearAlerts();
    setBusy(true);
    try {
      const provider = new GoogleAuthProvider();
      const res = await signInWithPopup(auth, provider);
      await ensureUserDoc(res.user.uid, res.user.email, res.user.displayName, res.user.photoURL);
      router.replace(nextPath);
    } catch (e: any) {
      setErr(tError(e?.code));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4">
      <form onSubmit={onSubmitEmailPassword} className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">{mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}</div>
          <button
            type="button"
            onClick={() => { clearAlerts(); setMode((m) => (m === "login" ? "signup" : "login")); }}
            className="text-sm underline"
          >
            {mode === "login" ? "ยังไม่มีบัญชี? สมัครสมาชิก" : "มีบัญชีแล้ว? เข้าสู่ระบบ"}
          </button>
        </div>

        <label className="block">
          <div className="text-sm text-slate-600 mb-1">อีเมล</div>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="you@example.com"
          />
        </label>

        <label className="block">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600 mb-1">รหัสผ่าน</div>
            {mode === "login" && (
              <button type="button" onClick={onResetPassword} className="text-xs text-blue-600 hover:underline">
                ลืมรหัสผ่าน?
              </button>
            )}
          </div>
          <input
            type="password"
            minLength={6}
            required
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            className="w-full rounded-lg border px-3 py-2"
            placeholder="อย่างน้อย 6 ตัวอักษร"
          />
        </label>

        {err && <div className="rounded-lg bg-rose-50 text-rose-700 px-3 py-2 text-sm">{err}</div>}
        {msg && <div className="rounded-lg bg-emerald-50 text-emerald-700 px-3 py-2 text-sm">{msg}</div>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "กำลังดำเนินการ..." : mode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"}
        </button>
      </form>

      <div className="my-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <div className="text-xs text-slate-500">หรือ</div>
        <div className="h-px flex-1 bg-slate-200" />
      </div>

      <button
        type="button"
        onClick={onLoginWithGoogle}
        disabled={busy}
        className="w-full rounded-lg border px-4 py-2 hover:bg-slate-50 disabled:opacity-50 inline-flex items-center justify-center gap-2"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
          <path fill="#FFC107" d="M43.6 20.5h-1.6v-.1H24v7.3h11.3c-1.6 4.7-6 8.1-11.3 8.1-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 6 .9 8.2 2.9l5-5C34.6 6.4 29.6 4.5 24 4.5 12.8 4.5 3.9 13.4 3.9 24.6S12.8 44.7 24 44.7c11.1 0 20.1-9 20.1-20.1 0-1.3-.1-2.6-.5-4.1z"/>
          <path fill="#FF3D00" d="M6.3 14.7l6 4.4c1.6-3.7 5.3-6.3 9.7-6.3 3.1 0 6 .9 8.2 2.9l5-5C34.6 6.4 29.6 4.5 24 4.5c-7.7 0-14.3 4.4-17.7 10.2z"/>
          <path fill="#4CAF50" d="M24 44.7c5.3 0 10.3-2 14-5.3l-6.5-5.3c-2 1.4-4.6 2.2-7.5 2.2-5.3 0-9.8-3.4-11.4-8.2l-6 4.6c3.5 6.1 10.1 10 17.4 10z"/>
          <path fill="#1976D2" d="M43.6 20.5H24v7.3h11.3c-1.1 3.1-3.2 5.6-6.1 7.3l6.5 5.3c-3.7 2.5-8.3 4-11.7 4-7.3 0-13.9-3.9-17.4-10l-6-4.6c1.5 4.8 6 8.2 11.4 8.2 5.3 0 9.7-3.4 11.3-8.1H24v-7.3h19.6v.1z"/>
        </svg>
        เข้าสู่ระบบด้วย Google
      </button>
    </div>
  );
}
