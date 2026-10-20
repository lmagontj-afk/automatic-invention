import type { WeeklyDocument } from "./weekly-document";
export const OFFLINE_KEY = "quadro-offline-v1";
export const OFFLINE_TTL = 24 * 60 * 60 * 1000;
export interface OfflineSnapshot {
  version: 1;
  userId: string;
  congregationId: string;
  role: string;
  createdAt: number;
  expiresAt: number;
  document: WeeklyDocument;
}
export function snapshotValid(snapshot: OfflineSnapshot, now: number): boolean {
  return (
    snapshot.version === 1 &&
    Number.isFinite(snapshot.createdAt) &&
    Number.isFinite(snapshot.expiresAt) &&
    snapshot.createdAt <= now &&
    snapshot.expiresAt > now &&
    snapshot.expiresAt - snapshot.createdAt > 0 &&
    snapshot.expiresAt - snapshot.createdAt <= OFFLINE_TTL &&
    Array.isArray(snapshot.document?.meetings)
  );
}
export function clearOfflineSnapshot() {
  try {
    localStorage.removeItem(OFFLINE_KEY);
  } catch {
    /* Nenhum armazenamento acessível para limpar. */
  }
}
export function retainSnapshotForUser(userId: string | null) {
  try {
    const raw = localStorage.getItem(OFFLINE_KEY);
    if (raw) {
      const value = JSON.parse(raw) as OfflineSnapshot;
      if (!snapshotValid(value, Date.now()) || value.userId !== userId)
        clearOfflineSnapshot();
    }
  } catch {
    clearOfflineSnapshot();
  }
}
export function retainSnapshotForScope(
  userId: string,
  cid: string,
  role: string,
) {
  try {
    const raw = localStorage.getItem(OFFLINE_KEY);
    if (raw) {
      const value = JSON.parse(raw) as OfflineSnapshot;
      if (
        !snapshotValid(value, Date.now()) ||
        value.userId !== userId ||
        value.congregationId !== cid ||
        value.role !== role
      )
        clearOfflineSnapshot();
    }
  } catch {
    clearOfflineSnapshot();
  }
}
async function activateOfflineWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext)
    throw new Error(
      "A consulta offline exige HTTPS e um navegador com suporte a service worker.",
    );
  const registration = await navigator.serviceWorker.register("/sw.js");
  await registration.update();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      navigator.serviceWorker.removeEventListener("controllerchange", check);
      reject(
        new Error(
          "A consulta offline ainda não está pronta. Mantenha a conexão e tente novamente.",
        ),
      );
    }, 10_000);
    function check() {
      if (navigator.serviceWorker.controller) {
        clearTimeout(timer);
        navigator.serviceWorker.removeEventListener("controllerchange", check);
        resolve();
      }
    }
    navigator.serviceWorker.addEventListener("controllerchange", check);
    check();
  });
}
export async function saveOfflineSnapshot(snapshot: OfflineSnapshot) {
  await activateOfflineWorker();
  try {
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(snapshot));
  } catch {
    throw new Error(
      "O navegador bloqueou o armazenamento ou está sem espaço. Libere espaço e tente novamente.",
    );
  }
}
