"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useState } from "react";

const HIDE_NAV_ON = ["/login", "/register", "/setup-username"];

type Unsub = () => void;
function drainFirebaseUnsubs() {
  const g = globalThis as unknown as { firebaseUnsubs?: Unsub[] };
  const arr = g.firebaseUnsubs;
  if (Array.isArray(arr)) {
    arr.forEach((fn) => {
      try { fn(); } catch {}
    });
    g.firebaseUnsubs = [];
  }
}

export default function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const hideRightNav = HIDE_NAV_ON.some((p) => pathname.startsWith(p));

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      // ปิดทุก snapshot ก่อน signOut
      drainFirebaseUnsubs();
      await signOut(auth);
      router.replace("/login");
    } catch (err) {
      console.error("Logout failed:", err);
      router.replace("/login");
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <header
      id="app-header"
      className="sticky top-0 z-40 border-b border-border/60 bg-white/80 backdrop-blur"
    >
      <nav className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-4">
        <Link href="/" className="font-semibold tracking-tight">
          Chat
        </Link>

        {!hideRightNav && (
          <div className="ml-auto flex gap-2">
            <Link href="/chat" className="px-3 py-1.5 rounded-lg hover:bg-muted">
              Chat
            </Link>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="px-3 py-1.5 rounded-lg hover:bg-muted disabled:opacity-60"
            >
              {loggingOut ? "กำลังออก..." : "Logout"}
            </button>
          </div>
        )}
      </nav>
    </header>
  );
}
