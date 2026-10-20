import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadWorkspace } from "./repository";
import type { Membership } from "./types";
const selected: Membership = {
  userId: "u",
  congregationId: "c",
  memberId: "m",
  role: "irmao",
};
function fakeClient(
  role: string,
  cap = 1000,
  revoked = false,
  changed = false,
) {
  const binding = { user_id: "u", congregation_id: "c", member_id: "m", role };
  const tables: Record<string, Record<string, unknown>[]> = {
    congregations: [
      { id: "c", name: "Fictícia", timezone: "America/Sao_Paulo" },
    ],
    congregation_memberships: changed ? [] : [binding],
    members: Array.from({ length: 5 }, (_, i) => ({
      id: `m${i}`,
      name: `Pessoa ${i} Exemplo`,
      category: "anciao",
      active: true,
    })),
    member_phones: [{ member_id: "m0", whatsapp: "5511000000000" }],
    meeting_templates: [
      {
        id: "t",
        name: "Modelo fictício",
        kind: "meio_de_semana",
        weekday: 3,
        local_time: "19:30",
      },
    ],
  };
  const from = vi.fn((table: string) => {
    const query = {
      select: () => query,
      eq: () => query,
      order: () => query,
      maybeSingle: async () => ({
        data: revoked ? null : binding,
        error: null,
      }),
      range: async (start: number, end: number) => ({
        data: (tables[table] ?? []).slice(
          start,
          Math.min(end + 1, start + cap),
        ),
        error: null,
      }),
    };
    return query;
  });
  return { client: { from } as unknown as SupabaseClient, from };
}
describe("carregamento autoritativo da congregação", () => {
  it("um irmão promovido carrega modelos e telefones sem relogar", async () => {
    const { client } = fakeClient("designador");
    const result = await loadWorkspace(client, selected);
    expect(result.membership.role).toBe("designador");
    expect(result.templates).toHaveLength(1);
    expect(result.members[0].whatsapp).toBe("5511000000000");
  });
  it("perfil rebaixado não consulta telefones ou modelos", async () => {
    const { client, from } = fakeClient("irmao");
    const result = await loadWorkspace(client, {
      ...selected,
      role: "administrador",
    });
    expect(result.membership.role).toBe("irmao");
    expect(from.mock.calls.flat()).not.toContain("member_phones");
    expect(from.mock.calls.flat()).not.toContain("meeting_templates");
    expect(result.members.every((m) => m.whatsapp === "")).toBe(true);
  });
  it("não trunca dados se o servidor reduzir o limite de linhas", async () => {
    const { client } = fakeClient("designador", 2);
    expect((await loadWorkspace(client, selected)).members).toHaveLength(5);
  });
  it("vínculo revogado bloqueia o carregamento em vez de usar o perfil antigo", async () => {
    const { client, from } = fakeClient("administrador", 1000, true);
    await expect(loadWorkspace(client, selected)).rejects.toMatchObject({
      code: "42501",
    });
    expect(from).toHaveBeenCalledTimes(1);
  });
  it("mudança de vínculo durante as consultas descarta o conjunto inteiro", async () => {
    const { client } = fakeClient("administrador", 1000, false, true);
    await expect(loadWorkspace(client, selected)).rejects.toMatchObject({
      code: "42501",
    });
  });
});
