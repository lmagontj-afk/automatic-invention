import { describe, expect, it } from "vitest";
import { createDemo } from "../app/demo";
import { whatsAppTransport, weeklyNotices, type Notice } from "./index";
const notice: Notice = {
  memberId: "m",
  name: "Caio Exemplo",
  phone: "+55 (11) 00000-0000",
  timezone: "America/Sao_Paulo",
  items: [
    {
      part: "Leitura & comentário",
      meeting: "Reunião fictícia",
      startsAt: "2026-10-22T01:30:00Z",
    },
  ],
};
describe("avisos WhatsApp", () => {
  it("gera link seguro com acentos, nome, parte, reunião, dia e data locais", () => {
    const { href, message } = whatsAppTransport.prepare(notice),
      url = new URL(href);
    expect(url.origin).toBe("https://wa.me");
    expect(url.pathname).toBe("/5511000000000");
    expect(url.searchParams.get("text")).toBe(message);
    expect(message).toContain("Caio Exemplo");
    expect(message).toContain("Leitura & comentário");
    expect(message).toContain("quarta-feira");
    expect(message).toContain("21 de outubro de 2026");
    expect(message).toContain("confirme");
  });
  it.each(["", "123", "javascript:alert(1)", "5511000000000000000000"])(
    "rejeita telefone inválido %s",
    (phone) =>
      expect(() => whatsAppTransport.prepare({ ...notice, phone })).toThrow(
        "WhatsApp válido",
      ),
  );
  it("agrupa apenas designações pendentes e não expõe telefones ao perfil irmão", () => {
    const d = createDemo("2026-10-19"),
      meetings = d.meetings.slice(0, 2);
    d.assignments.forEach((a) => (a.status = "pendente"));
    const notices = weeklyNotices(
      d,
      meetings.map((m) => m.id),
    );
    expect(notices.length).toBeGreaterThan(0);
    expect(notices.reduce((n, a) => n + a.items.length, 0)).toBe(17);
    d.membership.role = "irmao";
    expect(
      weeklyNotices(
        d,
        meetings.map((m) => m.id),
      ),
    ).toEqual([]);
  });
  it("não avisa recusas ou confirmações", () => {
    const d = createDemo("2026-10-19");
    expect(
      weeklyNotices(
        d,
        d.meetings.map((m) => m.id),
      ),
    ).toEqual([]);
    d.assignments.forEach((a) => (a.status = "recusada"));
    expect(
      weeklyNotices(
        d,
        d.meetings.map((m) => m.id),
      ),
    ).toEqual([]);
  });
});
