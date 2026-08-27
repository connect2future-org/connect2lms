import type { Db } from "mongodb";
import { describe, expect, it, vi } from "vitest";
import { ensureMongoIndexes } from "../mongo";

function createIndexDb() {
  const createIndex = vi.fn(async () => "index");
  const collection = () => ({ listIndexes: () => ({ toArray: async () => [] }), createIndex, dropIndex: vi.fn(async () => undefined) });
  return { db: { collection } as unknown as Db, createIndex };
}

describe("commercial MongoDB constraint configuration", () => {
  it("creates institution-scoped credential uniqueness while permitting equivalent identities in separate schools", async () => { const { db, createIndex } = createIndexDb(); await ensureMongoIndexes(db); expect(createIndex).toHaveBeenCalledWith({ schoolId: 1, username: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { schoolId: { $type: "number" }, username: { $type: "string" } } })); expect(createIndex).toHaveBeenCalledWith({ schoolId: 1, email: 1 }, expect.objectContaining({ unique: true })); const keys = new Set<string>(); const claim = (schoolId: number, username: string) => { const key = `${schoolId}:${username}`; if (keys.has(key)) return false; keys.add(key); return true; }; expect(claim(1, "alex")).toBe(true); expect(claim(1, "alex")).toBe(false); expect(claim(2, "alex")).toBe(true); });
  it("creates a partial compound active-attempt constraint so submitted attempts remain historical", async () => { const { db, createIndex } = createIndexDb(); await ensureMongoIndexes(db); expect(createIndex).toHaveBeenCalledWith({ assessmentId: 1, studentId: 1, status: 1 }, expect.objectContaining({ unique: true, partialFilterExpression: { status: "IN_PROGRESS" } })); const active = new Set<string>(); const create = (assessmentId: number, studentId: number, status: string) => { const key = `${assessmentId}:${studentId}`; if (status === "IN_PROGRESS" && active.has(key)) return false; if (status === "IN_PROGRESS") active.add(key); return true; }; expect(create(5, 9, "IN_PROGRESS")).toBe(true); expect(create(5, 9, "IN_PROGRESS")).toBe(false); active.delete("5:9"); expect(create(5, 9, "SUBMITTED")).toBe(true); expect(create(5, 9, "IN_PROGRESS")).toBe(true); });
});
