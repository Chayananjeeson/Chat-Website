// src/lib/firebase.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage, connectStorageEmulator } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!, // ใช้เป็น default bucket ให้ Storage
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
  // measurementId ไม่จำเป็นถ้าไม่ได้ใช้ Analytics
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// ✅ ใช้ default bucket จาก config (ไม่ต้องระบุ gs://)
export const storage = getStorage(app);
export const auth = getAuth(app);
export const db = getFirestore(app);

/* (ออปชัน) ต่อ Emulator ตอน dev เพื่อเทสได้ปลอดภัย
   ตั้งค่า .env:
   NEXT_PUBLIC_USE_EMULATOR=true
*/
if (process.env.NEXT_PUBLIC_USE_EMULATOR === "true") {
  // กันต่อซ้ำเวลารัน hot-reload
  try {
    connectAuthEmulator(auth, "http://127.0.0.1:9099");
  } catch {}
  try {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
  } catch {}
  try {
    connectStorageEmulator(storage, "127.0.0.1", 9199);
  } catch {}
}
