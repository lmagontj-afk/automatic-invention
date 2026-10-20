import {
  changePartEligibility,
  isEligible,
  suggest,
  type Assignment,
} from "../suggest";
import { newTemplate } from "./defaults";
import { addDays, engineInput, localDate } from "./domain";
import type { Command, Meeting, Workspace } from "./types";
function audit(
  data: Workspace,
  meetingId: string,
  partId: string,
  memberId: string,
  assignmentId: string,
  action: string,
  status: Workspace["assignments"][number]["status"],
) {
  data.audit.push({
    id: crypto.randomUUID(),
    meetingId,
    partId,
    memberId,
    assignmentId,
    action,
    status,
    occurredAt: new Date().toISOString(),
  });
}
function save(data: Workspace, m: Meeting, rows: Assignment[]) {
  const before = data.assignments.filter((a) => a.meetingId === m.id);
  data.assignments = data.assignments.filter((a) => a.meetingId !== m.id);
  for (const a of before)
    if (!rows.some((r) => r.partId === a.partId && r.memberId === a.memberId))
      audit(data, m.id, a.partId, a.memberId!, a.id, "DELETE", a.status);
  for (const row of rows) {
    const p = m.parts.find((p) => p.id === row.partId)!;
    p.emptyLocked = row.memberId === null && row.locked;
    if (row.memberId) {
      const previous = before.find(
        (a) => a.partId === row.partId && a.memberId === row.memberId,
      );
      const next = {
        ...row,
        id: previous?.id ?? crypto.randomUUID(),
        meetingId: m.id,
        status: previous?.status ?? ("pendente" as const),
      };
      data.assignments.push(next);
      if (!previous || previous.locked !== next.locked)
        audit(
          data,
          m.id,
          row.partId,
          row.memberId,
          next.id,
          previous ? "UPDATE" : "INSERT",
          next.status,
        );
    }
  }
  m.revision++;
}
function revalidate(data: Workspace) {
  for (const m of data.meetings) {
    const date = localDate(m.startsAt, data.congregation.timezone);
    const rows = engineInput(data, m).existing.map((a) => {
      const person = data.members.find((p) => p.id === a.memberId),
        p = m.parts.find((p) => p.id === a.partId)!;
      return person &&
        (!person.active ||
          !isEligible(person.category, p.eligibility) ||
          (person.isVisitor && !p.allowsVisitor) ||
          person.unavailability.some(
            (r) => r.startsOn <= date && date <= r.endsOn,
          ))
        ? { ...a, memberId: null, locked: false }
        : a;
    });
    save(data, m, rows);
  }
}
export function applyDemo(workspace: Workspace, command: Command): Workspace {
  const data = structuredClone(workspace),
    cid = data.congregation.id;
  switch (command.type) {
    case "member": {
      const v = command.value,
        old = data.members.find((m) => m.id === v.id);
      if (old) Object.assign(old, v);
      else
        data.members.push({
          ...v,
          id: crypto.randomUUID(),
          congregationId: cid,
          unavailability: [],
        });
      revalidate(data);
      break;
    }
    case "template": {
      const v = command.value;
      data.templates = data.templates.filter((t) => t.id !== v.id);
      data.templates.push(v);
      for (const m of data.meetings.filter(
        (m) => m.templateId === v.id && new Date(m.startsAt) > new Date(),
      ))
        for (const p of m.parts) {
          const templatePart = v.parts.find((t) => t.id === p.templatePartId);
          if (templatePart) p.eligibility = templatePart.eligibility;
        }
      revalidate(data);
      break;
    }
    case "week":
      for (const t of data.templates) {
        const date = addDays(command.monday, (t.weekday + 6) % 7),
          startsAt = new Date(`${date}T${t.time}:00-03:00`).toISOString();
        if (
          data.meetings.some(
            (m) => m.templateId === t.id && m.startsAt === startsAt,
          )
        )
          continue;
        data.meetings.push({
          id: crypto.randomUUID(),
          templateId: t.id,
          title: t.name,
          kind: t.kind,
          startsAt,
          revision: 0,
          parts: t.parts.map((p, position) => ({
            ...p,
            id: crypto.randomUUID(),
            templatePartId: p.id,
            position,
            emptyLocked: false,
          })),
        });
      }
      break;
    case "assignments": {
      const m = data.meetings.find((m) => m.id === command.meetingId)!;
      if (m.revision !== command.revision)
        throw new Error("O quadro mudou. Atualize e tente novamente.");
      save(data, m, command.rows);
      break;
    }
    case "rule": {
      const m = data.meetings.find((m) => m.id === command.meetingId)!;
      const result = changePartEligibility(
        engineInput(data, m),
        command.partId,
        command.rule,
      );
      m.parts.find((p) => p.id === command.partId)!.eligibility = command.rule;
      save(data, m, result.assignments);
      break;
    }
    case "availability":
      data.members
        .find((m) => m.id === command.memberId)!
        .unavailability.push({
          id: crypto.randomUUID(),
          startsOn: command.startsOn,
          endsOn: command.endsOn,
        });
      revalidate(data);
      break;
    case "removeAvailability":
      data.members.forEach(
        (m) =>
          (m.unavailability = m.unavailability.filter(
            (a) => a.id !== command.id,
          )),
      );
      break;
    case "membership":
      data.memberships = data.memberships.filter(
        (m) => m.userId !== command.value.userId,
      );
      data.memberships.push(command.value);
      break;
  }
  return data;
}
export function createDemo(monday: string): Workspace {
  const cid = "demo",
    memberId = "person-0",
    userId = "demo-user";
  let data: Workspace = {
    congregation: {
      id: cid,
      name: "Horizonte · demonstração",
      timezone: "America/Sao_Paulo",
    },
    membership: {
      userId,
      congregationId: cid,
      memberId,
      role: "administrador",
    },
    memberships: [
      { userId, congregationId: cid, memberId, role: "administrador" },
    ],
    members: Array.from({ length: 18 }, (_, i) => ({
      id: `person-${i}`,
      congregationId: cid,
      name:
        [
          "Caio",
          "Davi",
          "Luan",
          "Nilo",
          "Rui",
          "Ivo",
          "Teo",
          "Leo",
          "Breno",
          "Ciro",
          "Gil",
          "Noel",
          "Lia",
          "Eva",
          "Ana",
          "Mila",
          "Bia",
          "Lara",
        ][i] + " Exemplo",
      category:
        i < 5
          ? "anciao"
          : i < 10
            ? "servo_ministerial"
            : i < 12
              ? "irmao_batizado"
              : "irma",
      active: true,
      isVisitor: false,
      whatsapp: "",
      unavailability: [],
    })),
    templates: [newTemplate("meio_de_semana"), newTemplate("fim_de_semana")],
    meetings: [],
    assignments: [],
    audit: [],
  };
  data = applyDemo(data, { type: "week", monday: addDays(monday, -7) });
  for (const m of [...data.meetings]) {
    const result = suggest(engineInput(data, m));
    if (result.status !== "blocked")
      data = applyDemo(data, {
        type: "assignments",
        meetingId: m.id,
        revision: m.revision,
        rows: result.assignments,
      });
  }
  data.assignments.forEach((a) => (a.status = "confirmada"));
  return applyDemo(data, { type: "week", monday });
}
