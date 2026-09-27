import crypto from "node:crypto";

/**
 * Application-layer encryption for user data.
 *
 * Model: the app is the only holder of GLOWUP_ENCRYPTION_KEY. The database
 * only ever sees ciphertext, so a leaked DB credential, a curious insider,
 * or a SQL-injection dump reveals nothing readable.
 *
 * Absolute zero-knowledge is impossible here BY DESIGN: the server must know
 * target_url to perform the redirect — that is the product. Everything else
 * (bios, referrers, countries) is opaque even to the DB.
 *
 * Key rotation: values carry a "v1:" prefix so old data can be re-encrypted
 * transparently if the key ever changes (see maybeDecrypt).
 */

/**
 * Key sources, in priority order: the dedicated key (production) and, as a
 * transition fallback, the service-role key (deploys before the dedicated key
 * was set). Decryption tries the primary first, then the fallback, so data
 * written before the dedicated key was added keeps working — and is silently
 * re-encrypted under the primary key on read.
 */
const KEY_SOURCES = [
  ...new Set(
    [
      process.env.GLOWUP_ENCRYPTION_KEY,
      process.env.SUPABASE_SERVICE_ROLE_KEY, // transition fallback; never rely on it alone in prod
    ].filter((v): v is string => typeof v === "string" && v.length > 0),
  ),
];

const keys = KEY_SOURCES.map((src) =>
  crypto.createHash("sha256").update(`glowup:v1:${src}`).digest(),
);

export function isEncryptionConfigured(): boolean {
  return keys.length > 0;
}

/** AES-256-GCM encrypt a string → "v1:iv:tag:ciphertext" (all base64url). */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keys[0], iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

/** Decrypt a value produced by encrypt(). Returns null on any failure. */
export function decrypt(payload: string): string | null {
  return decryptWithMeta(payload).value;
}

/**
 * Decrypt and report which key worked. `keyIndex > 0` means the value was
 * written under a fallback key — the caller should re-encrypt it with the
 * primary key.
 */
export function decryptWithMeta(payload: string): {
  value: string | null;
  keyIndex: number;
} {
  try {
    const [v, ivB64, tagB64, dataB64] = payload.split(":");
    if (v !== "v1" || !ivB64 || !tagB64 || !dataB64) return { value: null, keyIndex: -1 };

    for (let i = 0; i < keys.length; i++) {
      try {
        const decipher = crypto.createDecipheriv(
          "aes-256-gcm",
          keys[i],
          Buffer.from(ivB64, "base64url"),
        );
        decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
        const dec = Buffer.concat([
          decipher.update(Buffer.from(dataB64, "base64url")),
          decipher.final(),
        ]);
        return { value: dec.toString("utf8"), keyIndex: i };
      } catch {
        // try the next key source
      }
    }
    return { value: null, keyIndex: -1 };
  } catch {
    return { value: null, keyIndex: -1 };
  }
}

/** Bulk helper: decrypt a ciphertext or pass plain values through (pre-migration data). */
export function maybeDecrypt(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.startsWith("v1:") ? decrypt(value) : value;
}

/** Deterministic keyed hash — lets us search/filter on encrypted columns. */
export function hmac(value: string): string {
  return crypto.createHmac("sha256", keys[0]).update(value).digest("base64url");
}

/** HMAC under every configured key — for lookups across key transitions. */
export function hmacAll(value: string): string[] {
  const unique = [...new Set(keys.map((k) => crypto.createHmac("sha256", k).update(value).digest("base64url")))];
  return unique;
}

/**
 * The manage token shown to users is random; the DB stores only this HMAC of
 * it. A stolen database therefore cannot be used to take over anyone's links.
 */
export function generateManageToken(): string {
  return crypto.randomUUID();
}

export function hashToken(token: string): string {
  return hmac(`token:${token.trim().toLowerCase()}`);
}
