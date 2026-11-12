import { File } from 'expo-file-system';

export function normalizeDeviceId(value: string) {
  return value.trim().toUpperCase();
}

export function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function formatDateLabel(value: Date | null) {
  if (!value) {
    return 'Select date of birth';
  }

  return value.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function buildIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
  return template.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const next = character === 'x' ? random : (random & 0x3) | 0x8;
    return next.toString(16);
  });
}

export async function resolveFileSize(uri: string, fallback: number | null | undefined) {
  if (typeof fallback === 'number' && fallback > 0) {
    return fallback;
  }

  const file = new File(uri);
  return file.size;
}
