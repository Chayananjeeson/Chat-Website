// app/admin/page.tsx
import React from "react";
import AdminGuard from "@/components/AdminGuard";

export default function AdminHome() {
  return (
    <AdminGuard>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Total Users</div>
          <div className="mt-2 text-3xl font-semibold" id="stat-users">—</div>
          <p className="mt-3 text-xs text-gray-500">Go to Users to manage roles.</p>
        </div>
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">New (7 days)</div>
          <div className="mt-2 text-3xl font-semibold">—</div>
        </div>
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <div className="text-sm text-gray-500">Reports</div>
          <div className="mt-2 text-3xl font-semibold">—</div>
        </div>
      </div>
    </AdminGuard>
  );
}
