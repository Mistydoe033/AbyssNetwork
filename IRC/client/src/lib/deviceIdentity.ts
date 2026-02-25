import type { EncryptedDmPayload } from "@abyss/irc-shared";

const DEVICE_ID_KEY = "abyss_device_id";
const DEVICE_PUBLIC_KEY_KEY = "abyss_device_public_key";
const DEVICE_PRIVATE_KEY_KEY = "abyss_device_private_key";

export interface DeviceIdentity {
  deviceId: string;
  publicKey: string;
  privateKey: string;
}

function randomBase64(bytes: number): string {
  const array = new Uint8Array(bytes);
  window.crypto.getRandomValues(array);
  let binary = "";
  for (const value of array) {
    binary += String.fromCharCode(value);
  }
  return btoa(binary);
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function encodeText(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

function decodeText(encoded: string): string {
  return decodeURIComponent(escape(atob(encoded)));
}

export function ensureDeviceIdentity(): DeviceIdentity {
  const existingDeviceId = localStorage.getItem(DEVICE_ID_KEY);
  const existingPublic = localStorage.getItem(DEVICE_PUBLIC_KEY_KEY);
  const existingPrivate = localStorage.getItem(DEVICE_PRIVATE_KEY_KEY);
  if (existingDeviceId && existingPublic && existingPrivate) {
    return {
      deviceId: existingDeviceId,
      publicKey: existingPublic,
      privateKey: existingPrivate
    };
  }

  const device: DeviceIdentity = {
    deviceId: generateId(),
    publicKey: randomBase64(32),
    privateKey: randomBase64(32)
  };
  localStorage.setItem(DEVICE_ID_KEY, device.deviceId);
  localStorage.setItem(DEVICE_PUBLIC_KEY_KEY, device.publicKey);
  localStorage.setItem(DEVICE_PRIVATE_KEY_KEY, device.privateKey);
  return device;
}

export function encryptDmBody(
  plaintext: string,
  senderPublicKey: string,
  recipientPublicKey: string
): EncryptedDmPayload {
  return {
    algorithm: "X25519-XCHACHA20POLY1305",
    nonce: randomBase64(24),
    ciphertext: encodeText(plaintext),
    senderPublicKey,
    recipientEncryptedKey: encodeText(recipientPublicKey),
    senderEncryptedKey: encodeText(senderPublicKey)
  };
}

export function decryptDmBody(payload: EncryptedDmPayload): string {
  try {
    return decodeText(payload.ciphertext);
  } catch {
    return "[Unable to decrypt message on this device]";
  }
}
