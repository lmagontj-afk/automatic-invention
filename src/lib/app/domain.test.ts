import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyDemo, createDemo } from "./demo";
import {
  conflicts,
  engineInput,
  localDate,
  mondayOf,
  weekMeetings,
} from "./domain";
import { suggest } from "../suggest";
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());
describe("fluxo semanal", () => {
  it("usa a data civil da congregação em vez do dia UTC", () => {
    expect(localDate("2026-10-22T01:00:00Z", "America/Sao_Paulo")).toBe(
      "2026-10-21",
    );
    expect(mondayOf("2026-10-25")).toBe("2026-10-19");
  });
  it("gera semanas idempotentes e separa as duas reuniões", () => {
    const d = createDemo("2026-10-19"),
      next = applyDemo(d, { type: "week", monday: "2026-10-19" });
    expect(next.meetings.length).toBe(d.meetings.length);
    expect(weekMeetings(d, "2026-10-19")).toHaveLength(2);
  });
  it("sugere, salva e preserva o status de uma pessoa inalterada", () => {
    let d = createDemo("2026-10-19");
    const m = d.meetings[0],
      before = d.assignments.find((a) => a.meetingId === m.id)!;
    expect(before.status).toBe("confirmada");
    d = applyDemo(d, {
      type: "assignments",
      meetingId: m.id,
      revision: m.revision,
      rows: [...engineInput(d, m).existing],
    });
    expect(d.assignments.find((a) => a.id === before.id)?.status).toBe(
      "confirmada",
    );
    expect(() =>
      applyDemo(d, {
        type: "assignments",
        meetingId: m.id,
        revision: m.revision,
        rows: [],
      }),
    ).toThrow("mudou");
  });
  it("alerta duplicação e indisponibilidade no rascunho", () => {
    const d = createDemo("2026-10-19"),
      m = weekMeetings(d, "2026-10-19")[0],
      person = d.members[0];
    person.unavailability.push({
      id: "a",
      startsOn: "2026-10-21",
      endsOn: "2026-10-21",
    });
    d.assignments.push(
      ...m.parts.slice(0, 2).map((p) => ({
        id: p.id,
        meetingId: m.id,
        partId: p.id,
        memberId: person.id,
        locked: false,
        status: "pendente" as const,
      })),
    );
    expect(conflicts(d, m).some((e) => e.includes("duas vezes"))).toBe(true);
    expect(conflicts(d, m).some((e) => e.includes("indisponível"))).toBe(true);
  });
  it("limpa designação incompatível após mudar categoria", () => {
    let d = createDemo("2026-10-19");
    const m = weekMeetings(d, "2026-10-19")[0],
      result = suggest(engineInput(d, m));
    if (result.status === "blocked") throw new Error();
    d = applyDemo(d, {
      type: "assignments",
      meetingId: m.id,
      revision: m.revision,
      rows: result.assignments,
    });
    const a = d.assignments.find(
        (a) =>
          a.meetingId === m.id &&
          m.parts.find((p) => p.id === a.partId)?.eligibility ===
            "somente_anciaos",
      )!,
      person = d.members.find((p) => p.id === a.memberId)!;
    d = applyDemo(d, {
      type: "member",
      value: {
        id: person.id,
        name: person.name,
        category: "irma",
        active: true,
        isVisitor: false,
        whatsapp: "",
      },
    });
    expect(d.assignments.some((r) => r.id === a.id)).toBe(false);
  });
});

it("recusa permanece excluída após substituição e não entra na frequência", () => {
  let d = createDemo("2035-03-19");
  let m = weekMeetings(d, "2035-03-19")[0];
  const rows = engineInput(d, m).existing.map((a, i) => ({
    ...a,
    memberId: i === 0 ? d.membership.memberId : null,
  }));
  d = applyDemo(d, {
    type: "assignments",
    meetingId: m.id,
    revision: m.revision,
    rows,
  });
  const old = d.assignments.find((a) => a.meetingId === m.id)!;
  d = applyDemo(d, {
    type: "response",
    assignmentId: old.id,
    expectedStatus: "pendente",
    answer: "recusada",
  });
  m = d.meetings.find((r) => r.id === m.id)!;
  expect(engineInput(d, m).parts[0].excludedMemberIds).toContain(old.memberId);
  d = applyDemo(d, {
    type: "assignments",
    meetingId: m.id,
    revision: m.revision,
    rows: engineInput(d, m).existing.map((a, i) =>
      i === 0 ? { ...a, memberId: "person-1" } : a,
    ),
  });
  m = d.meetings.find((r) => r.id === m.id)!;
  expect(engineInput(d, m).parts[0].excludedMemberIds).toContain(old.memberId);
});

it("mudanças de cadastro preservam participações passadas na demonstração", () => {
  let d = createDemo("2020-01-06");
  const before = d.assignments.filter((a) => a.memberId === "person-0");
  expect(before.length).toBeGreaterThan(0);
  const person = d.members[0];
  d = applyDemo(d, {
    type: "member",
    value: {
      id: person.id,
      name: person.name,
      category: "irma",
      active: false,
      isVisitor: false,
      whatsapp: "",
    },
  });
  expect(
    d.assignments.filter((a) => a.memberId === person.id).map((a) => a.id),
  ).toEqual(before.map((a) => a.id));
});

it("retirar permissão de visitantes do modelo revalida as cópias futuras", () => {
  let d = createDemo("2035-03-19");
  const m = weekMeetings(d, "2035-03-19").find(
      (m) => m.kind === "fim_de_semana",
    )!,
    p = m.parts.find((p) => p.allowsVisitor)!;
  d.members[0].isVisitor = true;
  d = applyDemo(d, {
    type: "assignments",
    meetingId: m.id,
    revision: m.revision,
    rows: engineInput(d, m).existing.map((a) => ({
      ...a,
      memberId: a.partId === p.id ? d.members[0].id : null,
    })),
  });
  const template = d.templates.find((t) => t.id === m.templateId)!;
  d = applyDemo(d, {
    type: "template",
    isNew: false,
    value: {
      ...template,
      parts: template.parts.map((slot) => ({ ...slot, allowsVisitor: false })),
    },
  });
  expect(
    d.meetings
      .find((meeting) => meeting.id === m.id)!
      .parts.find((part) => part.id === p.id)!.allowsVisitor,
  ).toBe(false);
  expect(d.assignments.some((a) => a.partId === p.id)).toBe(false);
});
