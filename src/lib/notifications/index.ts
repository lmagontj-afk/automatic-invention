import type { Workspace } from "../app/types";
export interface NoticeItem {
  part: string;
  meeting: string;
  startsAt: string;
}
export interface Notice {
  memberId: string;
  name: string;
  phone: string;
  timezone: string;
  items: NoticeItem[];
}
export interface PreparedNotification {
  message: string;
  href: string;
}
/** Provider boundary. A future official API adapter can lead to a server-side
 * review/dispatch route. UI never assumes that opening an action means sent.
 */
export interface NotificationTransport {
  prepare(notice: Notice): PreparedNotification;
}
export function noticeMessage(notice: Notice): string {
  if (!notice.name.trim() || notice.items.length === 0)
    throw new Error("Salve uma designação antes de preparar o aviso.");
  const format = new Intl.DateTimeFormat("pt-BR", {
    timeZone: notice.timezone,
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return [
    `Olá, ${notice.name}!`,
    "",
    notice.items.length === 1
      ? "Você tem uma designação:"
      : "Suas designações da semana:",
    ...notice.items.map(
      (item) =>
        `• ${item.part} — ${item.meeting}\n  ${format.format(new Date(item.startsAt))}`,
    ),
    "",
    "Por favor, confirme se poderá participar. Se não puder, avise para organizarmos um substituto. Você também pode confirmar ou recusar no Quadro semanal, usando sua conta. Obrigado!",
  ].join("\n");
}
export const whatsAppTransport: NotificationTransport = {
  prepare(notice) {
    if (!/^[+\d\s().-]+$/.test(notice.phone))
      throw new Error(
        "Cadastre um WhatsApp válido com país e DDD na tela Irmãos.",
      );
    const digits = notice.phone.replace(/\D/g, "");
    if (!/^[1-9][0-9]{7,14}$/.test(digits))
      throw new Error(
        "Cadastre um WhatsApp válido com país e DDD na tela Irmãos.",
      );
    const message = noticeMessage(notice);
    return {
      message,
      href: `https://wa.me/${digits}?text=${encodeURIComponent(message)}`,
    };
  },
};
export function weeklyNotices(
  data: Workspace,
  meetingIds: readonly string[],
): Notice[] {
  if (data.membership.role === "irmao") return [];
  const grouped = new Map<string, Notice>();
  for (const a of data.assignments) {
    if (
      !meetingIds.includes(a.meetingId) ||
      !a.memberId ||
      a.status !== "pendente"
    )
      continue;
    const member = data.members.find((p) => p.id === a.memberId),
      meeting = data.meetings.find((m) => m.id === a.meetingId),
      part = meeting?.parts.find((p) => p.id === a.partId);
    if (!member || !meeting || !part) continue;
    const notice = grouped.get(member.id) ?? {
      memberId: member.id,
      name: member.name,
      phone: member.whatsapp,
      timezone: data.congregation.timezone,
      items: [],
    };
    notice.items.push({
      part: part.title,
      meeting: meeting.title,
      startsAt: meeting.startsAt,
    });
    grouped.set(member.id, notice);
  }
  return [...grouped.values()]
    .map((n) => ({
      ...n,
      items: n.items.sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
