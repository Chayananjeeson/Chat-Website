// app/api/admin/users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getFirestore } from "firebase-admin/firestore";
import { verifyAdminRequest } from "@/lib/firebaseAdmin";

export async function GET(req: NextRequest) {
  const { ok, status, payload } = await verifyAdminRequest(req);
  if (!ok) return NextResponse.json({ error: payload }, { status });

  const db = getFirestore();
  const snap = await db.collection("users").limit(500).get();
  const users = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
  return NextResponse.json({ users });
}
