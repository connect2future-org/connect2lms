import { describe, expect, it } from "vitest";
import { ownerCredentialHealth } from "./ownerAuth";

describe("dedicated Super Admin credentials", () => {
  it("accepts the managed owner credentials through the lightweight health check", async () => {
    const email = process.env.SUPER_ADMIN_EMAIL;
    const password = process.env.SUPER_ADMIN_PASSWORD;
    expect(email).toBeTruthy();
    expect(password).toBeTruthy();
    await expect(ownerCredentialHealth(email!, password!)).resolves.toEqual({ valid: true });
  });
});
