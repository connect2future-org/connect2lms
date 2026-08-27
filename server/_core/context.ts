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
  let user = await getLmsSessionUser(opts.req);
  if (!user) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch {
      user = null;
    }
  }
  return { req: opts.req, res: opts.res, user };
}
