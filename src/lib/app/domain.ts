import { isEligible, type SuggestInput } from "../suggest";
import type { Meeting, Workspace } from "./types";
export function localDate(iso: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function mondayOf(date: string) {
  return addDays(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
}
export function dateLabel(iso: string, timezone: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}
export function weekMeetings(data: Workspace, monday: string) {
  return data.meetings
    .filter((m) => {
      const d = localDate(m.startsAt, data.congregation.timezone);
      return d >= monday && d < addDays(monday, 7);
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
export function engineInput(data: Workspace, meeting: Meeting): SuggestInput {
  return {
    congregationId: data.congregation.id,
    meeting: {
      id: meeting.id,
      congregationId: data.congregation.id,
      date: localDate(meeting.startsAt, data.congregation.timezone),
    },
    parts: meeting.parts.map((p) => ({
      ...p,
      congregationId: data.congregation.id,
      meetingId: meeting.id,
      excludedMemberIds: declinedMembers(data, p.id),
    })),
    members: data.members,
    existing: meeting.parts.map((p) => {
      const a = data.assignments.find((a) => a.partId === p.id);
      return {
        partId: p.id,
        memberId: a?.memberId ?? null,
        locked: a?.locked ?? p.emptyLocked,
      };
    }),
    history: data.assignments.flatMap((a) => {
      const m = data.meetings.find((m) => m.id === a.meetingId);
      return m && a.memberId
        ? [
            {
              assignmentId: a.id,
              congregationId: data.congregation.id,
              meetingId: m.id,
              memberId: a.memberId,
              date: localDate(m.startsAt, data.congregation.timezone),
              status: a.status,
            },
          ]
        : [];
    }),
  };
}
export function conflicts(data: Workspace, meeting: Meeting): string[] {
  const input = engineInput(data, meeting),
    used = new Set<string>(),
    errors: string[] = [];
  for (const a of input.existing) {
    if (!a.memberId) continue;
    const m = data.members.find((m) => m.id === a.memberId),
      p = meeting.parts.find((p) => p.id === a.partId)!;
    if (used.has(a.memberId))
      errors.push(`${m?.name ?? "Pessoa"} aparece duas vezes nesta reunião.`);
    used.add(a.memberId);
    if (
      !m ||
      !m.active ||
      !isEligible(m.category, p.eligibility) ||
      (m.isVisitor && !p.allowsVisitor)
    )
      errors.push(`${p.title}: a pessoa não atende à regra atual.`);
    if (
      m?.unavailability.some(
        (r) =>
          r.startsOn <= input.meeting.date && input.meeting.date <= r.endsOn,
      )
    )
      errors.push(`${m.name} está indisponível nesta data.`);
  }
  return errors;
}
export function friendlyError(error: unknown) {
  const e = error as { message?: string; code?: string };
  if (e.code === "40001")
    return "O quadro foi alterado por outra pessoa. Atualize os dados e tente novamente.";
  if (e.code === "42501")
    return "Seu perfil não permite esta ação. Peça ao administrador para revisar seu acesso.";
  if (e.code === "23505")
    return "Já existe um cadastro ou uma designação com esses dados. Atualize e revise as duplicações.";
  if (e.code === "23503")
    return "Este registro ainda está em uso ou pertence a outra congregação. Revise os vínculos.";
  if (e.message?.includes("fetch") || e.message?.includes("network"))
    return "Não foi possível conectar. Verifique sua conexão e tente novamente.";
  return (
    e.message ||
    "Não foi possível concluir. Atualize os dados e tente novamente."
  );
}

/** Latest event per assignment, including removed refusals, survives replacements. */
export function declinedMembers(data: Workspace, partId: string): string[] {
  const latest = new Map<string, Workspace["audit"][number]>();
  for (const event of data.audit.filter((a) => a.partId === partId)) {
    const previous = latest.get(event.assignmentId);
    if (!previous || event.occurredAt >= previous.occurredAt)
      latest.set(event.assignmentId, event);
  }
  return [
    ...new Set(
      [...latest.values()]
        .filter((a) => a.status === "recusada")
        .map((a) => a.memberId)
        .concat(
          data.assignments
            .filter(
              (a) =>
                a.partId === partId && a.status === "recusada" && a.memberId,
            )
            .map((a) => a.memberId!),
        ),
    ),
  ];
}
