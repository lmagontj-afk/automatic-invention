import type { Kind, Slot, Template } from "./types";
export function newSlot(
  title = "Nova parte",
  section = "Programa",
  eligibility: Slot["eligibility"] = "irmaos_batizados",
  slot: Slot["slot"] = "titular",
  groupKey: string | null = null,
): Slot {
  return {
    id: crypto.randomUUID(),
    title,
    section,
    position: 0,
    groupKey,
    slot,
    eligibility,
    allowsVisitor: false,
  };
}
export function newTemplate(kind: Kind): Template {
  const parts =
    kind === "meio_de_semana"
      ? [
          newSlot("Presidente", "Abertura", "anciaos_e_servos"),
          newSlot("Oração inicial", "Abertura"),
          newSlot("Discurso", "Reflexões bíblicas", "anciaos_e_servos"),
          newSlot(
            "Joias espirituais",
            "Reflexões bíblicas",
            "anciaos_e_servos",
          ),
          newSlot("Leitura", "Reflexões bíblicas"),
          newSlot(
            "Demonstração · titular",
            "Prática do ministério",
            "qualquer_pessoa",
            "titular",
            "demonstracao-1",
          ),
          newSlot(
            "Demonstração · ajudante",
            "Prática do ministério",
            "qualquer_pessoa",
            "ajudante",
            "demonstracao-1",
          ),
          newSlot("Parte de aplicação", "Vida cristã", "anciaos_e_servos"),
          newSlot(
            "Estudo bíblico · dirigente",
            "Vida cristã",
            "somente_anciaos",
            "dirigente",
            "estudo",
          ),
          newSlot(
            "Estudo bíblico · leitor",
            "Vida cristã",
            "irmaos_batizados",
            "leitor",
            "estudo",
          ),
          newSlot("Oração final", "Encerramento"),
        ]
      : [
          newSlot("Presidente", "Abertura", "anciaos_e_servos"),
          newSlot("Oração inicial", "Abertura"),
          {
            ...newSlot("Discurso público", "Discurso", "anciaos_e_servos"),
            allowsVisitor: true,
          },
          newSlot(
            "Estudo · dirigente",
            "Estudo em grupo",
            "somente_anciaos",
            "dirigente",
            "estudo",
          ),
          newSlot(
            "Estudo · leitor",
            "Estudo em grupo",
            "irmaos_batizados",
            "leitor",
            "estudo",
          ),
          newSlot("Oração final", "Encerramento"),
        ];
  return {
    id: crypto.randomUUID(),
    name:
      kind === "meio_de_semana"
        ? "Reunião do meio de semana"
        : "Reunião do fim de semana",
    kind,
    weekday: kind === "meio_de_semana" ? 3 : 0,
    time: kind === "meio_de_semana" ? "19:30" : "09:00",
    parts: parts.map((p, position) => ({ ...p, position })),
  };
}
