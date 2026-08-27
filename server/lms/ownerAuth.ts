import { timingSafeEqual } from "node:crypto";

function equalSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function ownerCredentialHealth(email: string, password: string) {
  const configuredEmail = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase() ?? "";
  const configuredPassword = process.env.SUPER_ADMIN_PASSWORD ?? "";
  const valid = Boolean(configuredEmail && configuredPassword && email.trim().toLowerCase() === configuredEmail && equalSecret(password, configuredPassword));
  return { valid };
}

export async function verifyOwnerCredentials(email: string, password: string) {
  return (await ownerCredentialHealth(email, password)).valid;
}
