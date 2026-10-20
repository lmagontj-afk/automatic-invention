import { dateLabel, weekMeetings } from "./domain";
import type { Workspace } from "./types";
export interface WeeklyDocument {
  congregation: string;
  monday: string;
  generatedAt: string;
  meetings: {
    title: string;
    when: string;
    parts: { section: string; title: string; name: string; status: string }[];
  }[];
}
/** Deliberate allowlist projection: no phones, auth identifiers or audit payloads. */
export function weeklyDocument(
  data: Workspace,
  monday: string,
  now = new Date(),
): WeeklyDocument {
  const ownOnly = data.membership.role === "irmao";
  return {
    congregation: data.congregation.name,
    monday,
    generatedAt: dateLabel(now.toISOString(), data.congregation.timezone),
    meetings: weekMeetings(data, monday).flatMap((m) => {
      const parts = m.parts.flatMap((p) => {
        const a = data.assignments.find((a) => a.partId === p.id);
        if (ownOnly && a?.memberId !== data.membership.memberId) return [];
        return [
          {
            section: p.section,
            title: p.title,
            name:
              data.members.find((person) => person.id === a?.memberId)?.name ??
              "Não designado",
            status:
              a?.status === "confirmada"
                ? "Confirmada"
                : a?.status === "recusada"
                  ? "Recusada"
                  : a
                    ? "Aguardando confirmação"
                    : "Em aberto",
          },
        ];
      });
      return parts.length
        ? [
            {
              title: m.title,
              when: dateLabel(m.startsAt, data.congregation.timezone),
              parts,
            },
          ]
        : [];
    }),
  };
}
export function documentLines(doc: WeeklyDocument): string[] {
  return [
    "QUADRO SEMANAL",
    doc.congregation,
    `Semana de ${doc.monday.split("-").reverse().join("/")}`,
    "",
    ...doc.meetings.flatMap((m) => [
      m.title,
      m.when,
      ...m.parts.flatMap((p) => [
        `${p.section} · ${p.title}`,
        `${p.name} — ${p.status}`,
        "",
      ]),
      "",
    ]),
    `Cópia gerada: ${doc.generatedAt}`,
    "Consulte o aplicativo para conferir atualizações.",
  ];
}
export function wrapText(
  text: string,
  measure: (value: string) => number,
  maxWidth: number,
): string[] {
  if (maxWidth <= 0) throw new Error("Largura inválida");
  const output: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (measure(word) > maxWidth) {
      if (current) {
        output.push(current);
        current = "";
      }
      let chunk = "";
      for (const char of word) {
        if (chunk && measure(chunk + char) > maxWidth) {
          output.push(chunk);
          chunk = "";
        }
        chunk += char;
      }
      current = chunk;
      continue;
    }
    const next = current ? `${current} ${word}` : word;
    if (current && measure(next) > maxWidth) {
      output.push(current);
      current = word;
    } else current = next;
  }
  output.push(current);
  return output;
}
