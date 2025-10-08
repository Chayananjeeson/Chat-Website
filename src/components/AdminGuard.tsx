// components/AdminGuard.tsx
"use client";
import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, getIdToken, getIdTokenResult, User } from "firebase/auth";
import { auth } from "@/lib/firebase";

interface AdminContextValue {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  token: string | null;
}

const AdminContext = createContext<AdminContextValue>({
  user: null, loading: true, isAdmin: false, token: null,
});
export const useAdmin = () => useContext(AdminContext);

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setIsAdmin(false);
        setToken(null);
        setLoading(false);
        return;
      }
      try {
        const idToken = await getIdToken(u, true);
        setToken(idToken);
        const res = await getIdTokenResult(u, true);
        const role = (res.claims as any).role || ((res.claims as any).admin ? "admin" : undefined);
        setIsAdmin(role === "admin");
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const value = useMemo(() => ({ user, loading, isAdmin, token }), [user, loading, isAdmin, token]);

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900" />
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold">403 — Forbidden</h2>
        <p className="mt-2 text-sm text-gray-600">Admin only. Please sign in with an admin account.</p>
      </div>
    );
  }

  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}
