import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createAppConfig } from "../config/env.js";

const CONFIRM_FLAG = "--confirm";
const HELP_FLAGS = new Set(["--help", "-h"]);
const BATCH_LIMIT = 450;
const CAMPUS = "PS";
const CARGO_VALUES = new Set(["professor", "tecnico", "aluno"]);

interface SnapshotPerson {
  name: string;
  matricula: string;
  email: string | null;
  cargo: string;
}

interface ExistingPerson {
  name?: string;
  email?: string;
  cargo?: string;
  campus?: string;
  active?: boolean;
  pinHash?: string | null;
  pinFingerprint?: string | null;
  pinCiphertext?: string | null;
  pinGeneratedAt?: string | null;
  pinUpdatedAt?: string | null;
}

interface ExistingPersonWithId extends ExistingPerson {
  id: string;
}

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
    process.env.EXTERNAL_ENV_PATH ?? "/etc/chaveiro-ifbaps/.env",
});

if (!config.firebaseRuntime.serviceAccountPath) {
  throw new Error("Service account do Firebase nao configurada.");
}

const app =
  getApps()[0] ??
  initializeApp({ credential: cert(config.firebaseRuntime.serviceAccountPath) });
const db = getFirestore(app);

const snapshotPath = resolveSnapshotPath();
const snapshot = loadSnapshot(snapshotPath);
const byMatricula = new Map(snapshot.map((person) => [person.matricula, person]));

const existing = await listExisting();
const existingByMatricula = new Map(
  existing.map((person) => [person.id.slice("p-".length), person]),
);

const toCreate = snapshot.filter(
  (person) => !existingByMatricula.has(person.matricula),
);
const toUpdate = snapshot.filter(
  (person) => {
    const current = existingByMatricula.get(person.matricula);
    return current !== undefined && hasIdentityDiff(person, current);
  },
);
const toInactivate = [...existingByMatricula.entries()]
  .filter(([matricula, current]) => {
    const inSnapshot = byMatricula.has(matricula);
    const serverRecord =
      current.cargo === "professor" || current.cargo === "tecnico";
    return (
      !inSnapshot &&
      serverRecord &&
      current.campus === CAMPUS &&
      current.active !== false
    );
  })
  .map(([, current]) => current);

console.log(
  JSON.stringify(
    {
      mode: confirmed ? "import" : "dry-run",
      snapshotPath,
      snapshotCount: snapshot.length,
      existingCount: existing.length,
      toCreate: toCreate.length,
      toUpdate: toUpdate.length,
      toInactivate: toInactivate.length,
      preservedFields: [
        "pinHash",
        "pinFingerprint",
        "pinCiphertext",
        "pinGeneratedAt",
        "pinUpdatedAt",
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

const result = await runImport(toCreate, toUpdate, toInactivate);
const activeAfter = await countActive();
console.log(JSON.stringify({ result, activeAfter }, null, 2));

async function runImport(
  create: SnapshotPerson[],
  update: SnapshotPerson[],
  inactivate: ExistingPersonWithId[],
): Promise<{ created: number; updated: number; inactivated: number }> {
  let created = 0;
  let updated = 0;
  let inactivated = 0;
  let batch = db.batch();
  let operations = 0;

  const flush = async (): Promise<void> => {
    if (operations === 0) {
      return;
    }
    await batch.commit();
    batch = db.batch();
    operations = 0;
  };

  for (const person of create) {
    batch.set(personRef(person.matricula), toPersonData(person));
    created += 1;
    operations += 1;
    if (operations === BATCH_LIMIT) {
      await flush();
    }
  }

  for (const person of update) {
    const current = existingByMatricula.get(person.matricula);
    const data = toPersonData(person);
    if (current?.pinHash) {
      data.pinHash = current.pinHash;
      data.pinFingerprint = current.pinFingerprint ?? null;
      data.pinCiphertext = current.pinCiphertext ?? null;
      data.pinGeneratedAt = current.pinGeneratedAt ?? null;
      data.pinUpdatedAt = current.pinUpdatedAt ?? null;
    }
    batch.set(personRef(person.matricula), data);
    updated += 1;
    operations += 1;
    if (operations === BATCH_LIMIT) {
      await flush();
    }
  }

  for (const current of inactivate) {
    if (operations + 2 > BATCH_LIMIT) {
      await flush();
    }
    batch.update(personRef(current.id.slice("p-".length)), {
      active: false,
      inactivatedAt: new Date().toISOString(),
    });
    batch.set(
      db.collection(config.pinControl.offlineVerifiersCollection).doc(current.id),
      {
        personId: current.id,
        active: false,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
    inactivated += 1;
    operations += 2;
    if (operations === BATCH_LIMIT) {
      await flush();
    }
  }

  await flush();
  return { created, updated, inactivated };
}

interface PersonData {
  id: string;
  name: string;
  email: string | null;
  matricula: string;
  cargo: string;
  campus: string;
  active: boolean;
  importedAt: string;
  pinHash?: string;
  pinFingerprint?: string | null;
  pinCiphertext?: string | null;
  pinGeneratedAt?: string | null;
  pinUpdatedAt?: string | null;
}

function toPersonData(person: SnapshotPerson): PersonData {
  const id = `p-${person.matricula}`;
  return {
    id,
    name: person.name,
    email: person.email,
    matricula: person.matricula,
    cargo: person.cargo,
    campus: CAMPUS,
    active: true,
    importedAt: new Date().toISOString(),
  };
}

function hasIdentityDiff(
  person: SnapshotPerson,
  current: ExistingPerson,
): boolean {
  return (
    person.name !== current.name ||
    person.email !== current.email ||
    person.cargo !== current.cargo ||
    CAMPUS !== current.campus
  );
}

async function listExisting(): Promise<ExistingPersonWithId[]> {
  const snapshot = await db.collection("people").get();
  return snapshot.docs.map((document) => {
    const data = document.data() as ExistingPerson;
    return { id: document.id, ...data };
  });
}

async function countActive(): Promise<number> {
  const snapshot = await db
    .collection("people")
    .where("active", "==", true)
    .count()
    .get();
  return snapshot.data().count;
}

function personRef(matricula: string) {
  return db.collection("people").doc(`p-${matricula}`);
}

function resolveSnapshotPath(): string {
  return (
    process.env.PEOPLE_JSON_PATH?.trim() ||
    join(process.cwd(), "scripts/pessoas-ps.json")
  );
}

function loadSnapshot(path: string): SnapshotPerson[] {
  if (!existsSync(path)) {
    throw new Error(`Snapshot nao encontrado: ${path}`);
  }

  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;

  if (!Array.isArray(raw)) {
    throw new Error("Snapshot invalido: esperado um array de pessoas.");
  }

  const persons: SnapshotPerson[] = [];

  for (const item of raw) {
    const person = item as Partial<SnapshotPerson>;
    if (
      typeof person.name !== "string" ||
      typeof person.matricula !== "string" ||
      (typeof person.email !== "string" && person.email !== null) ||
      typeof person.cargo !== "string" ||
      !CARGO_VALUES.has(person.cargo)
    ) {
      throw new Error(`Entrada invalida no snapshot: ${JSON.stringify(item)}`);
    }
    persons.push({
      name: person.name,
      matricula: person.matricula,
      email: person.email,
      cargo: person.cargo,
    });
  }

  return persons;
}

function printUsage(): void {
  console.log(`Uso:
  npm run people:import
  npm run people:import -- --confirm

Sem o argumento de confirmacao, o comando apenas mostra o que seria feito.
O import confirmado le o snapshot versionado (scripts/pessoas-ps.json), cria
people/p-<matricula>, atualiza campos de identidade preservando os campos do
PIN gerado e inativa registros de professor/tecnico de PS ausentes.

Variavel de ambiente opcional: PEOPLE_JSON_PATH para outro caminho de snapshot.
`);
}
