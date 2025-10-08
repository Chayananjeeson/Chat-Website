// src/components/ProfileBar.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";

type UserDoc = {
  username?: string;
  email?: string;
  photoURL?: string;
  displayName?: string;
};

export default function ProfileBar() {
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) return;
    const uref = doc(db, "users", u.uid);
    const unsub = onSnapshot(uref, (snap) => {
      setUserDoc((snap.data() as UserDoc) ?? {});
    });
    return () => unsub();
  }, []);

  const displayName =
    userDoc?.displayName || userDoc?.username || userDoc?.email || "ผู้ใช้";

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        {userDoc?.photoURL ? (
          <img
            src={userDoc.photoURL}
            alt={displayName}
            className="w-10 h-10 rounded-full object-cover border"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-slate-300 flex items-center justify-center text-sm font-medium text-white">
            {(displayName?.[0] || "👤").toString().toUpperCase()}
          </div>
        )}

        <div className="leading-tight">
          <div className="font-medium">{displayName}</div>
          <div className="text-xs text-slate-500">เข้าสู่ระบบแล้ว</div>
        </div>
      </div>

      {/* ปุ่มไปหน้าโปรไฟล์ */}
      <Link
        href="/profile"
        className="px-3 py-2 rounded-lg border bg-white hover:bg-slate-50 text-sm"
      >
        จัดการโปรไฟล์
      </Link>
    </div>
  );
}
