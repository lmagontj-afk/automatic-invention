import { describe, expect, it } from "vitest";
import { createDemo } from "./demo";
import { documentLines, weeklyDocument, wrapText } from "./weekly-document";
describe("exportação semanal", () => {
  it("projeta apenas dados do quadro, sem telefones, auditoria ou credenciais", () => {
    const d = createDemo("2026-10-19");
    d.members.forEach((m) => (m.whatsapp = "5511000000000"));
    const doc = weeklyDocument(d, "2026-10-12", new Date("2026-10-20T12:00Z")),
      json = JSON.stringify(doc);
    expect(doc.meetings).toHaveLength(2);
    expect(json).not.toContain("5511000000000");
    expect(json).not.toContain("demo-user");
    expect(json).not.toContain("whatsapp");
    expect(documentLines(doc).join("\n")).toContain("Confirmada");
  });
  it("o perfil irmão só exporta as próprias partes, mesmo com entrada abrangente", () => {
    const d = createDemo("2026-10-19");
    d.membership.role = "irmao";
    const doc = weeklyDocument(d, "2026-10-12");
    const names = doc.meetings.flatMap((m) => m.parts.map((p) => p.name));
    expect(names.length).toBeGreaterThan(0);
    expect(new Set(names)).toEqual(new Set(["Caio Exemplo"]));
  });
  it("não exporta outra semana e representa vagas sem designado", () => {
    const d = createDemo("2026-10-19");
    expect(weeklyDocument(d, "2026-11-02").meetings).toEqual([]);
    expect(documentLines(weeklyDocument(d, "2026-10-19")).join(" ")).toContain(
      "Não designado",
    );
  });
  it("quebra textos longos sem cortar nomes nem palavras sem espaços", () => {
    const result = wrapText(
      "Nome fictício " + "A".repeat(70),
      (s) => s.length,
      20,
    );
    expect(result.every((s) => s.length <= 20)).toBe(true);
    expect(result.join("").replace(/ /g, "")).toBe(
      "Nomefictício" + "A".repeat(70),
    );
    expect(wrapText("", (s) => s.length, 20)).toEqual([""]);
  });
});
