import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { LmsUser } from "../lms/types";
import { getLmsSessionUser } from "../lms/auth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: LmsUser | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  const user = await getLmsSessionUser(opts.req);
  return { req: opts.req, res: opts.res, user };
}
