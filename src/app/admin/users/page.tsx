// app/admin/users/page.tsx
"use client";
import React, { useState } from "react";
import useSWR from "swr";
import AdminGuard, { useAdmin } from "@/components/AdminGuard";

async function apiFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...(init || {}),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function UsersTable() {
  const { token } = useAdmin();
  const fetcher = (url: string) => apiFetch(url, token as string);
  const { data, error, mutate, isLoading } = useSWR(token ? "/api/admin/users" : null, fetcher, {
    revalidateOnFocus: false,
  });

  const [busyUid, setBusyUid] = useState<string | null>(null);

  const onChangeRole = async (uid: string, role: "admin" | "user") => {
    if (!token) return;
    setBusyUid(uid);
    try {
      await apiFetch("/api/admin/role", token, { method: "POST", body: JSON.stringify({ uid, role }) });
      await mutate();
    } finally {
      setBusyUid(null);
    }
  };

  if (isLoading) return <div className="p-6">Loading users…</div>;
  if (error) return <div className="p-6 text-red-600">{String(error)}</div>;

  const users = data?.users || [];

  return (
    <div className="rounded-2xl border bg-white">
      <div className="flex items-center justify-between p-4">
        <h2 className="text-lg font-semibold">Users ({users.length})</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-2">Display Name</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">UID</th>
              <th className="px-4 py-2">Role</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.uid} className="border-t">
                <td className="px-4 py-2">{u.displayName || "—"}</td>
                <td className="px-4 py-2">{u.email || "—"}</td>
                <td className="px-4 py-2 font-mono text-xs">{u.uid}</td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                      u.role === "admin" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {u.role || "user"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-2">
                    {u.role === "admin" ? (
                      <button
                        disabled={busyUid === u.uid}
                        onClick={() => onChangeRole(u.uid, "user")}
                        className="rounded-lg border px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                      >
                        Remove admin
                      </button>
                    ) : (
                      <button
                        disabled={busyUid === u.uid}
                        onClick={() => onChangeRole(u.uid, "admin")}
                        className="rounded-lg bg-gray-900 px-3 py-1 text-xs text-white hover:bg-black disabled:opacity-50"
                      >
                        Make admin
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function UsersPage() {
  return (
    <AdminGuard>
      <UsersTable />
    </AdminGuard>
  );
}
