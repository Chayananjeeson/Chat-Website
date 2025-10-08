// src/app/profile/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db, storage } from "@/lib/firebase";
import {
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import {
  getDownloadURL,
  ref,
  uploadBytesResumable,
  deleteObject,
} from "firebase/storage";

type UserDoc = {
  username?: string;
  email?: string;
  photoURL?: string;
  displayName?: string; // เก็บชื่อที่แสดง (หรือจะใช้ username แทนก็ได้)
  updatedAt?: any;
};

const USERNAME_REGEX = /^[a-z0-9_\.]{3,20}$/; // a-z 0-9 _ . ความยาว 3–20

export default function ProfilePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [me, setMe] = useState<UserDoc | null>(null);
  const [loading, setLoading] = useState(true);

  // ฟอร์ม
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [usernameStatus, setUsernameStatus] =
    useState<"idle" | "checking" | "available" | "taken" | "invalid">("idle");

  // อัปโหลดรูป
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  // โหลด user doc
  useEffect(() => {
    const u = auth.currentUser;
    if (!u) {
      router.replace("/login");
      return;
    }
    const unsub = onSnapshot(doc(db, "users", u.uid), (snap) => {
      const data = (snap.data() as UserDoc) ?? {};
      setMe(data);
      setDisplayName(data.displayName || data.username || "");
      setUsername(data.username || "");
      setLoading(false);
    });
    return () => unsub();
  }, [router]);

  // debounce เช็คชื่อว่าง
  useEffect(() => {
    let active = true;
    const u = auth.currentUser;
    if (!u) return;

    const check = async () => {
      if (!username || username === me?.username) {
        setUsernameStatus("idle");
        return;
      }
      if (!USERNAME_REGEX.test(username)) {
        setUsernameStatus("invalid");
        return;
      }
      setUsernameStatus("checking");
      const r = await getDoc(doc(db, "usernames", username));
      if (!active) return;
      setUsernameStatus(r.exists() ? "taken" : "available");
    };

    const t = setTimeout(check, 400);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [username, me?.username]);

  const changed =
    (displayName || "") !== (me?.displayName || me?.username || "") ||
    (username || "") !== (me?.username || "");

  const canSave =
    !loading &&
    changed &&
    (username === me?.username || usernameStatus === "available" || usernameStatus === "idle") &&
    (!!displayName || !!username);

  const pickFile = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const user = auth.currentUser;
    if (!user) return;
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("โปรดเลือกรูปภาพ");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("ไฟล์ใหญ่เกินไป (จำกัด ~5MB)");
      return;
    }

    setUploading(true);
    setProgress(0);
    try {
      const objectRef = ref(storage, `users/${user.uid}/avatar.jpg`);
      const task = uploadBytesResumable(objectRef, file, {
        cacheControl: "public, max-age=31536000",
      });
      task.on("state_changed", (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        setProgress(pct);
      });
      await task;
      const url = await getDownloadURL(objectRef);
      const bust = `${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`;

      await runTransaction(db, async (tx) => {
        const uref = doc(db, "users", user.uid);
        const snap = await tx.get(uref);
        if (!snap.exists()) throw new Error("user doc missing");
        tx.update(uref, { photoURL: bust, updatedAt: serverTimestamp() });
      });
      setProgress(null);
    } catch (e: any) {
      console.error("UPLOAD ERROR:", e?.code, e?.message, e);
      alert(`อัปโหลดไม่สำเร็จ: ${e?.code || e?.message || "unknown"}`);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeAvatar = async () => {
    const user = auth.currentUser;
    if (!user) return;
    if (!confirm("ลบรูปโปรไฟล์?")) return;
    try {
      // ลบไฟล์ใน storage
      await deleteObject(ref(storage, `users/${user.uid}/avatar.jpg`));
      // เคลียร์ photoURL ใน users doc
      await runTransaction(db, async (tx) => {
        const uref = doc(db, "users", user.uid);
        tx.update(uref, { photoURL: null, updatedAt: serverTimestamp() });
      });
    } catch (e) {
      console.error(e);
      alert("ลบไม่สำเร็จ");
    }
  };

  const save = async () => {
    const user = auth.currentUser;
    if (!user || !me) return;

    try {
      await runTransaction(db, async (tx) => {
        const uref = doc(db, "users", user.uid);
        const meSnap = await tx.get(uref);
        const before = (meSnap.data() as UserDoc) || {};
        const oldName = before.username || null;

        // 1) ถ้าจะเปลี่ยน username
        if (username && username !== oldName) {
          if (!USERNAME_REGEX.test(username)) {
            throw new Error("Invalid username");
          }
          // 1.1 จองชื่อใหม่ (rules จะปฏิเสธเองถ้ามีอยู่แล้ว)
          const newRef = doc(db, "usernames", username);
          const newSnap = await tx.get(newRef);
          if (newSnap.exists()) throw new Error("ชื่อผู้ใช้ถูกใช้แล้ว");
          tx.set(newRef, { uid: user.uid });

          // 1.2 ปลดชื่อเก่า (ถ้ามี และเป็นของเรา)
          if (oldName) {
            const oldRef = doc(db, "usernames", oldName);
            const oldSnap = await tx.get(oldRef);
            if (oldSnap.exists() && oldSnap.data()?.uid === user.uid) {
              tx.delete(oldRef);
            }
          }
        }

        // 2) อัปเดตโปรไฟล์
        tx.update(uref, {
          displayName: displayName || username || before.displayName || before.username || "",
          username: username || before.username || "",
          updatedAt: serverTimestamp(),
        });
      });

      alert("บันทึกแล้ว");
    } catch (e: any) {
      console.error("SAVE PROFILE ERROR:", e?.code, e?.message, e);
      alert(e?.message || "บันทึกไม่สำเร็จ");
    }
  };

  const nameHint = useMemo(() => {
    if (usernameStatus === "invalid")
      return "ใช้ a-z 0-9 จุดและขีดล่าง (3–20 ตัวอักษร)";
    if (usernameStatus === "taken") return "ชื่อผู้ใช้นี้ถูกใช้แล้ว";
    if (usernameStatus === "available") return "ใช้ได้นะ ✓";
    if (usernameStatus === "checking") return "กำลังตรวจสอบ…";
    return "เช่น ken_01, ken.dev";
  }, [usernameStatus]);

  if (loading) {
    return (
      <main className="max-w-lg mx-auto p-6">
        <div className="animate-pulse h-6 w-40 bg-slate-200 rounded mb-6" />
        <div className="h-32 w-full bg-white rounded-xl border" />
      </main>
    );
  }

  const display = me?.displayName || me?.username || me?.email || "ผู้ใช้";

  return (
    <main className="max-w-lg mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">โปรไฟล์</h1>

      {/* Avatar */}
      <div className="flex items-center gap-4 mb-6">
        {me?.photoURL ? (
          <img
            src={me.photoURL}
            alt={display}
            className="w-20 h-20 rounded-full object-cover border"
          />
        ) : (
          <div className="w-20 h-20 rounded-full bg-slate-300 flex items-center justify-center text-xl font-semibold text-white">
            {(display?.[0] || "👤").toString().toUpperCase()}
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onFile}
          />
          <button
            onClick={pickFile}
            disabled={uploading}
            className={`px-3 py-2 rounded-lg border ${
              uploading ? "bg-slate-100 text-slate-400" : "bg-white hover:bg-slate-50"
            }`}
          >
            {uploading ? `อัปโหลด… ${progress ?? 0}%` : "เปลี่ยนรูป"}
          </button>
          {me?.photoURL && (
            <button
              onClick={removeAvatar}
              className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50"
            >
              ลบรูป
            </button>
          )}
        </div>
      </div>

      {/* Form */}
      <div className="bg-white border rounded-xl p-4 space-y-4">
        <div>
          <label className="block text-sm text-slate-600 mb-1">ชื่อที่แสดง</label>
          <input
            className="w-full border rounded-lg px-3 py-2 outline-none"
            placeholder="เช่น ชื่อเล่น"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <p className="text-[12px] text-slate-500 mt-1">
            จะใช้แสดงใน UI (ถ้าเว้นว่างจะใช้ username แทน)
          </p>
        </div>

        <div>
          <label className="block text-sm text-slate-600 mb-1">Username</label>
          <input
            className="w-full border rounded-lg px-3 py-2 outline-none"
            placeholder="ken_01"
            value={username}
            onChange={(e) =>
              setUsername(e.target.value.trim().toLowerCase())
            }
          />
          <p
            className={`text-[12px] mt-1 ${
              usernameStatus === "available"
                ? "text-green-600"
                : usernameStatus === "taken" || usernameStatus === "invalid"
                ? "text-red-600"
                : "text-slate-500"
            }`}
          >
            {nameHint}
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={() => router.back()}
            className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={save}
            disabled={!canSave}
            className={`px-4 py-2 rounded-lg text-white ${
              canSave
                ? "bg-blue-600 hover:bg-blue-700"
                : "bg-blue-300 cursor-not-allowed"
            }`}
          >
            บันทึก
          </button>
        </div>
      </div>
    </main>
  );
}
