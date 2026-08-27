import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { LmsUser } from "../lms/types";
import { getLmsSessionUser } from "../lms/auth";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: LmsUser | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  const credentialModeHeader = opts.req.headers["x-lms-credential-session"];
  const credentialMode = Array.isArray(credentialModeHeader) ? credentialModeHeader.includes("1") : credentialModeHeader === "1";
  let user = await getLmsSessionUser(opts.req);
  if (!user && !credentialMode) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch {
      user = null;
    }
  }
  return { req: opts.req, res: opts.res, user };
}
