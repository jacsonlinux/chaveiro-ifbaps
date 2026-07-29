import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createAppConfig } from "../config/env.js";

const CONFIRM_FLAG = "--confirm-reset-pwa-data";
const HELP_FLAGS = new Set(["--help", "-h"]);
const OPERATIONAL_COLLECTIONS = [
  "key_movements",
  "key_locks",
  "key_occurrences",
] as const;

const args = process.argv.slice(2);

if (args.some((arg) => HELP_FLAGS.has(arg))) {
  printUsage();
  process.exit(0);
}

if (args.some((arg) => arg !== CONFIRM_FLAG)) {
  console.error(`Argumento desconhecido. Use ${CONFIRM_FLAG} para confirmar.`);
  process.exit(1);
}

const confirmed = args.includes(CONFIRM_FLAG);
const config = createAppConfig({
  ...process.env,
  EXTERNAL_ENV_PATH:
    process.env.EXTERNAL_ENV_PATH ?? "/etc/keychain-ifbaps/.env",
});

if (!config.firebaseRuntime.serviceAccountPath) {
  throw new Error("Service account do Firebase nao configurada.");
}

const app =
  getApps()[0] ??
  initializeApp({ credential: cert(config.firebaseRuntime.serviceAccountPath) });
const db = getFirestore(app);
const countsBefore = await countCollections();

console.log(
  JSON.stringify(
    {
      mode: confirmed ? "reset" : "dry-run",
      collections: OPERATIONAL_COLLECTIONS,
      countsBefore,
      preserved: [
        "users",
        "rooms",
        "keys",
        "key_room_links",
        "reservations",
        "occupancies",
      ],
    },
    null,
    2,
  ),
);

if (!confirmed) {
  console.log(`Nenhuma alteracao feita. Para confirmar, use ${CONFIRM_FLAG}.`);
  process.exit(0);
}

const deleted = await deleteCollections();
const countsAfter = await countCollections();

console.log(JSON.stringify({ deleted, countsAfter }, null, 2));

async function countCollections(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const name of OPERATIONAL_COLLECTIONS) {
    counts[name] = (await db.collection(name).get()).size;
  }
  return counts;
}

async function deleteCollections(): Promise<Record<string, number>> {
  const deleted: Record<string, number> = {};

  for (const name of OPERATIONAL_COLLECTIONS) {
    const snapshot = await db.collection(name).get();
    let batch = db.batch();
    let operations = 0;
    let count = 0;

    for (const document of snapshot.docs) {
      batch.delete(document.ref);
      operations += 1;
      count += 1;

      if (operations === 450) {
        await batch.commit();
        batch = db.batch();
        operations = 0;
      }
    }

    if (operations > 0) {
      await batch.commit();
    }
    deleted[name] = count;
  }

  return deleted;
}

function printUsage(): void {
  console.log(`Uso:
  ./scripts/reset-pwa-operational-data.sh
  ./scripts/reset-pwa-operational-data.sh ${CONFIRM_FLAG}

Sem o argumento de confirmacao, o comando apenas mostra as quantidades.
O reset confirmado remove somente key_movements, key_locks e key_occurrences.
`);
}
