// src/components/AppHeader.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const HIDE_NAV_ON = ["/login", "/register", "/setup-username"];

export default function AppHeader() {
  const pathname = usePathname();
  const hideRightNav = HIDE_NAV_ON.some((p) => pathname.startsWith(p));

  return (
    <header
      id="app-header" // ใช้คำนวณระยะ sticky ของแผงขวา
      className="sticky top-0 z-40 border-b border-border/60 bg-white/80 backdrop-blur"
    >
      <nav className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-4">
        <Link href="/" className="font-semibold tracking-tight">
          Chat
        </Link>

        {/* ขวาบน */}
        {!hideRightNav && (
          <div className="ml-auto flex gap-2">
            <Link href="/chat" className="px-3 py-1.5 rounded-lg hover:bg-muted">
              Chat
            </Link>
            <Link href="/login" className="px-3 py-1.5 rounded-lg hover:bg-muted">
              Logout
            </Link>
          </div>
        )}
      </nav>
    </header>
  );
}
