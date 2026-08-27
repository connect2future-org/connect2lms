import { afterAll, describe, expect, it } from "vitest";
import { closeMongo, getMongoDb } from "./mongo";

const uri = process.env.MONGODB_URI;
afterAll(async () => { await closeMongo(); });

const integrationDescribe = process.env.RUN_MONGO_INTEGRATION === "true" ? describe : describe.skip;

integrationDescribe("MongoDB Atlas configuration", () => {
  it("connects and responds to a lightweight ping", async () => { expect(uri, "MONGODB_URI must be configured").toMatch(/^mongodb(\+srv)?:\/\//); expect(await (await getMongoDb()).command({ ping: 1 })).toMatchObject({ ok: 1 }); }, 20_000);
});
