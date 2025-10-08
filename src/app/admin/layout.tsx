// app/admin/layout.tsx
import React from "react";
import Link from "next/link";

export const metadata = { title: "Admin" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between">
          <h1 className="text-xl font-semibold">Admin Dashboard</h1>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/" className="hover:underline">Back to App</Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 grid grid-cols-12 gap-6">
        <aside className="col-span-12 md:col-span-3 lg:col-span-2">
          <div className="sticky top-20 space-y-2">
            <Link href="/admin" className="block rounded-xl px-4 py-3 hover:bg-gray-100">Overview</Link>
            <Link href="/admin/users" className="block rounded-xl px-4 py-3 hover:bg-gray-100">Users</Link>
          </div>
        </aside>
        <main className="col-span-12 md:col-span-9 lg:col-span-10">{children}</main>
      </div>
    </div>
  );
}
