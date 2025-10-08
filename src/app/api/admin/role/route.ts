// app/api/admin/role/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { verifyAdminRequest } from "@/lib/firebaseAdmin";

export async function POST(req: NextRequest) {
  const { ok, status, payload } = await verifyAdminRequest(req);
  if (!ok) return NextResponse.json({ error: payload }, { status });

  const { uid, role } = await req.json();
  if (!uid || !role) {
    return NextResponse.json({ error: "uid and role required" }, { status: 400 });
  }

  const auth = getAuth();
  await auth.setCustomUserClaims(uid, role === "admin" ? { role: "admin" } : { role: "user" });

  const db = getFirestore();
  await db.collection("users").doc(uid).set({ role }, { merge: true });

  return NextResponse.json({ ok: true });
}
