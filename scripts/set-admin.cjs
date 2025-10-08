const admin = require("firebase-admin");
const fs = require("fs");
const path = require("path");

const SERVICE_ACCOUNT_PATH = path.resolve(__dirname, "service-account.json");
const ADMIN_EMAIL = "wwedied@gmail.com";

function initAdmin() {
  const svc = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
  admin.initializeApp({
    credential: admin.credential.cert(svc),
  });
}

async function main() {
  initAdmin();

  const auth = admin.auth();
  const fsdb = admin.firestore();

  const user = await auth.getUserByEmail(ADMIN_EMAIL);
  console.log("✅ Found user:", user.uid, user.email);

  await auth.setCustomUserClaims(user.uid, { admin: true, role: "admin" });
  console.log("✅ setCustomUserClaims done");

  await fsdb.doc(`users/${user.uid}`).set({ role: "admin" }, { merge: true });
  console.log("✅ Firestore users doc updated (role=admin)");

  console.log("\nสำเร็จ! ให้ผู้ใช้นี้ logout/login ใหม่ หรือ refresh token");
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
