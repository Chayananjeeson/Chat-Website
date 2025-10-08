// lib/firebaseAdmin.ts
import { NextRequest } from "next/server";
import * as admin from "firebase-admin";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  } catch (e) {
    const svcJson = process.env.SERVICE_ACCOUNT_JSON
      ? JSON.parse(process.env.SERVICE_ACCOUNT_JSON)
      : undefined;
    if (!svcJson) throw e;
    admin.initializeApp({ credential: admin.credential.cert(svcJson as any), projectId });
  }
}

export async function verifyAdminRequest(
  req: NextRequest
): Promise<{ ok: boolean; status: number; payload?: any }> {
  const authHeader = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) return { ok: false, status: 401, payload: "Missing Authorization header" };
  const token = authHeader.replace(/^Bearer\s+/i, "");
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const role = (decoded as any).role || ((decoded as any).admin ? "admin" : undefined);
    if (role !== "admin") return { ok: false, status: 403, payload: "Admin only" };
    return { ok: true, status: 200 };
  } catch (e: any) {
    return { ok: false, status: 401, payload: e?.message || "Invalid token" };
  }
}
