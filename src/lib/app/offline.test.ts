import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OFFLINE_KEY,
  OFFLINE_TTL,
  retainSnapshotForScope,
  retainSnapshotForUser,
  snapshotValid,
  type OfflineSnapshot,
} from "./offline";
const snapshot = (now = 100): OfflineSnapshot => ({
  version: 1,
  userId: "u",
  congregationId: "c",
  role: "irmao",
  createdAt: now,
  expiresAt: now + OFFLINE_TTL,
  document: {
    congregation: "Fictícia",
    monday: "2026-10-19",
    generatedAt: "agora",
    meetings: [],
  },
});
afterEach(() => vi.unstubAllGlobals());
describe("consulta offline", () => {
  it("aceita apenas a janela finita de até 24 horas", () => {
    const s = snapshot();
    expect(snapshotValid(s, 101)).toBe(true);
    expect(snapshotValid(s, s.expiresAt)).toBe(false);
    expect(snapshotValid(s, 99)).toBe(false);
    expect(snapshotValid({ ...s, expiresAt: s.expiresAt + 1 }, 101)).toBe(
      false,
    );
    expect(snapshotValid({ ...s, expiresAt: NaN }, 101)).toBe(false);
  });
  it("apaga a cópia ao mudar de usuário, congregação ou perfil", () => {
    const map = new Map<string, string>(),
      now = Date.now();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => map.get(key) ?? null,
      removeItem: (key: string) => map.delete(key),
    });
    for (const [user, cid, role] of [
      ["other", "c", "irmao"],
      ["u", "other", "irmao"],
      ["u", "c", "administrador"],
    ]) {
      map.set(OFFLINE_KEY, JSON.stringify(snapshot(now)));
      retainSnapshotForScope(user, cid, role);
      expect(map.has(OFFLINE_KEY)).toBe(false);
    }
    map.set(OFFLINE_KEY, JSON.stringify(snapshot(now)));
    retainSnapshotForUser(null);
    expect(map.has(OFFLINE_KEY)).toBe(false);
  });
  it("preserva apenas cópia válida do mesmo usuário e trata JSON danificado", () => {
    const map = new Map([[OFFLINE_KEY, JSON.stringify(snapshot(Date.now()))]]);
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => map.get(key) ?? null,
      removeItem: (key: string) => map.delete(key),
    });
    retainSnapshotForScope("u", "c", "irmao");
    expect(map.has(OFFLINE_KEY)).toBe(true);
    map.set(OFFLINE_KEY, "corrompido");
    retainSnapshotForUser("u");
    expect(map.has(OFFLINE_KEY)).toBe(false);
  });
});

it("apagar ou sair cancela uma gravação offline ainda aguardando o worker", async () => {
  const map = new Map<string, string>();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => (release = resolve));
  vi.stubGlobal("window", { isSecureContext: true });
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register: async () => ({ update: () => pending }),
      controller: {
        postMessage: (_data: unknown, ports: MessagePort[]) =>
          ports[0].postMessage({
            type: "OFFLINE_READY",
            version: 3,
            ready: true,
          }),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
  vi.stubGlobal("localStorage", {
    setItem: (key: string, value: string) => map.set(key, value),
    removeItem: (key: string) => map.delete(key),
  });
  const { saveOfflineSnapshot, clearOfflineSnapshot } =
    await import("./offline");
  const saving = saveOfflineSnapshot(snapshot(Date.now()));
  clearOfflineSnapshot();
  release();
  await expect(saving).rejects.toThrow("cancelada");
  expect(map.has(OFFLINE_KEY)).toBe(false);
});
