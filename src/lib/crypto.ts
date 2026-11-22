/**
 * 保管箱导出/导入：PBKDF2 + AES-GCM 全本地加解密。
 * 材料是隐私物，所以「备份」必须先加密；密码不进任何网络请求。
 */

const PBKDF2_ITERATIONS = 210_000;

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptJson(payload: unknown, password: string): Promise<Blob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const plain = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    plain as unknown as BufferSource,
  );
  const envelope = {
    format: "materialpass-vault/1",
    kdf: "PBKDF2-SHA256",
    cipher: "AES-GCM-256",
    salt: b64(salt.buffer),
    iv: b64(iv.buffer),
    data: b64(cipher),
  };
  return new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
}

export async function decryptVault<T>(raw: string, password: string): Promise<T> {
  const env = JSON.parse(raw) as { salt: string; iv: string; data: string; format?: string };
  if (env.format !== "materialpass-vault/1") throw new Error("不是材料通保管箱备份文件");
  const key = await deriveKey(password, unb64(env.salt));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: unb64(env.iv) as unknown as BufferSource },
    key,
    unb64(env.data) as unknown as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
