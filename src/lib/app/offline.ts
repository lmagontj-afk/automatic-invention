import type { WeeklyDocument } from "./weekly-document";
export const OFFLINE_KEY = "quadro-offline-v1";
let writeGeneration = 0;
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
  writeGeneration++;
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
  const registration = await navigator.serviceWorker.register("/sw.js", {
    updateViaCache: "none",
  });
  await registration.update();
  await new Promise<void>((resolve, reject) => {
    const channels: MessageChannel[] = [];
    const checked = new Set<ServiceWorker>();
    function cleanup() {
      clearTimeout(timer);
      navigator.serviceWorker.removeEventListener("controllerchange", check);
      channels.forEach((channel) => {
        channel.port1.close();
        channel.port2.close();
      });
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(
        new Error(
          "A consulta offline ainda não está pronta. Mantenha a conexão e tente novamente.",
        ),
      );
    }, 10_000);
    function check() {
      const controller = navigator.serviceWorker.controller;
      if (!controller || checked.has(controller)) return;
      checked.add(controller);
      const channel = new MessageChannel();
      channels.push(channel);
      channel.port1.onmessage = (event) => {
        if (event.data?.type !== "OFFLINE_READY" || event.data.version !== 3)
          return;
        cleanup();
        if (event.data.ready === true) resolve();
        else
          reject(
            new Error(
              "Não foi possível preparar os arquivos offline. Reconecte-se e tente novamente.",
            ),
          );
      };
      controller.postMessage({ type: "OFFLINE_READY" }, [channel.port2]);
    }
    navigator.serviceWorker.addEventListener("controllerchange", check);
    check();
  });
}
export async function saveOfflineSnapshot(snapshot: OfflineSnapshot) {
  const generation = writeGeneration;
  await activateOfflineWorker();
  if (generation !== writeGeneration)
    throw new Error(
      "A cópia foi cancelada porque o acesso ou a semana salva mudou. Entre novamente e salve a semana desejada.",
    );
  if (!snapshotValid(snapshot, Date.now()))
    throw new Error(
      "A cópia expirou. Atualize o quadro e salve a semana novamente.",
    );
  try {
    localStorage.setItem(OFFLINE_KEY, JSON.stringify(snapshot));
  } catch {
    throw new Error(
      "O navegador bloqueou o armazenamento ou está sem espaço. Libere espaço e tente novamente.",
    );
  }
}
