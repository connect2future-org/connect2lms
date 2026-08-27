import { closeMongo, ensureMongoIndexes, getMongoDb } from "./mongo";

async function main() {
  const db = await getMongoDb();
  await ensureMongoIndexes(db);
  await closeMongo();
  console.log("MongoDB indexes verified.");
}

void main();
