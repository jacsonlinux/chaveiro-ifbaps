import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createAppConfig } from "../config/env.js";

const config = createAppConfig();
const serviceAccountPath = config.firebaseRuntime.serviceAccountPath;
if (!serviceAccountPath) {
  throw new Error("Firebase service account nao configurada.");
}

const app = getApps()[0] ?? initializeApp({ credential: cert(serviceAccountPath) });
const db = getFirestore(app);
const keys = await db.collection(config.keyCatalogStore.keysCollection).get();
const movements = await db.collection(config.keyMovementStore.movementsCollection)
  .where("status", "==", "retirada")
  .get();
const openKeyIds = new Set(movements.docs.map((item) => item.data().keyId));
const batch = db.batch();
const now = new Date().toISOString();

for (const key of keys.docs) {
  batch.set(db.collection("key_public_status").doc(key.id), {
    keyId: key.id,
    status: openKeyIds.has(key.id) ? "retirada" : "disponivel",
    updatedAt: now,
    actorUid: "system-backfill",
  });
}

if (!keys.empty) {
  await batch.commit();
}

console.log(JSON.stringify({
  event: "public_key_status_backfilled",
  keyCount: keys.size,
  openMovementCount: movements.size,
}));
