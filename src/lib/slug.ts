import { randomBytes } from "node:crypto";

const SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function generateSlug(length = 10): string {
  const bytes = randomBytes(length);
  let slug = "";

  for (let i = 0; i < length; i++) {
    slug += SLUG_ALPHABET[bytes[i]! % SLUG_ALPHABET.length];
  }

  return slug;
}

export const SLUG_PATTERN = /^[a-z0-9]{8,12}$/;
