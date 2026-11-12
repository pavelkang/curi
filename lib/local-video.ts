// Local video takes, stored in this browser only (IndexedDB).
//
// Why IndexedDB and not localStorage: a recorded take is a webm blob,
// typically hundreds of KB to tens of MB. localStorage caps around
// 5 MB per origin and stores strings, so a base64 take would blow the
// demo store's quota and evict the courses themselves. IndexedDB
// stores the blob as-is, keyed by id; the lesson block only keeps the
// id (see VideoBlock.local_video_id in lib/content.ts), so the
// localStorage demo snapshot stays small.
//
// Honest limits, stated here and in the UI:
// - No fixed size cap in the app code, but takes over 100 MB are
//   refused with a plain message (a 2.5 Mbps take hits that at ~5 min;
//   MVP lessons are short takes, and a huge blob risks browser quota).
// - The blob lives in THIS browser only. It is not in Supabase, not
//   in Mux, and it does not sync to another device. Clearing site data
//   deletes it. The browser may also evict it under storage pressure.

import { newId } from "@/lib/content";

const DB_NAME = "curi-local-videos";
const STORE_NAME = "videos";
const DB_VERSION = 1;

// Refuse takes over 100 MB with a plain message, rather than failing
// silently on quota halfway through a save.
export const MAX_LOCAL_VIDEO_BYTES = 100 * 1024 * 1024;

export const LOCAL_VIDEO_NOTE =
  "Saved in this browser only. Takes up to 100 MB.";

type StoredVideo = {
  id: string;
  blob: Blob;
  size: number;
  createdAt: string;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open local video store."));
  });
}

export async function saveLocalVideo(blob: Blob): Promise<string> {
  if (blob.size > MAX_LOCAL_VIDEO_BYTES) {
    throw new Error(
      `That take is ${(blob.size / 1_000_000).toFixed(0)} MB — over the 100 MB this browser can keep. Record a shorter take.`,
    );
  }
  const db = await openDb();
  const id = `lv-${newId()}`;
  const record: StoredVideo = { id, blob, size: blob.size, createdAt: new Date().toISOString() };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const req = tx.objectStore(STORE_NAME).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Could not save the take in this browser."));
  });
  db.close();
  return id;
}

export async function getLocalVideoBlob(id: string): Promise<Blob | null> {
  const db = await openDb();
  try {
    const record = await new Promise<StoredVideo | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => resolve(req.result as StoredVideo | undefined);
      req.onerror = () => reject(req.error ?? new Error("Could not read the saved take."));
    });
    return record?.blob ?? null;
  } finally {
    db.close();
  }
}

// Object URL for a <video> src. The caller must revoke it on unmount.
export async function getLocalVideoUrl(id: string): Promise<string | null> {
  const blob = await getLocalVideoBlob(id);
  return blob ? URL.createObjectURL(blob) : null;
}

export async function deleteLocalVideo(id: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const req = tx.objectStore(STORE_NAME).delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error("Could not delete the saved take."));
    });
  } finally {
    db.close();
  }
}
