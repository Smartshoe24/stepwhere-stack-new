import { createHash, createHmac, randomBytes } from "node:crypto";

export function generateOpaqueToken(size = 32) {
  return randomBytes(size).toString("base64url");
}

export function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

export function createSignedToken(version: string, id: string, secret: string) {
  const payload = `${version}.${id}`;
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}
