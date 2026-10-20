"use client";
import { rankCandidates } from "@/lib/suggest";
import { engineInput } from "@/lib/app/domain";
import type { Meeting, StoredAssignment, Workspace } from "@/lib/app/types";
import type { Run } from "./week";
import { button, secondary } from "./ui";
export function ResponseButtons({
  data,
  assignment,
  meeting,
  run,
  busy,
}: {
  data: Workspace;
  assignment: StoredAssignment;
  meeting: Meeting;
  run: Run;
  busy: boolean;
}) {
  if (
    assignment.memberId !== data.membership.memberId ||
    new Date(meeting.startsAt) <= new Date()
  )
    return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <button
        className={button}
        disabled={busy || assignment.status === "confirmada"}
        onClick={() =>
          void run(
            {
              type: "response",
              assignmentId: assignment.id,
              expectedStatus: assignment.status,
              answer: "confirmada",
            },
            "Participação confirmada. Obrigado por responder!",
          )
        }
      >
        Confirmar participação
      </button>
      <button
        className={secondary}
        disabled={busy || assignment.status === "recusada"}
        onClick={() =>
          void run(
            {
              type: "response",
              assignmentId: assignment.id,
              expectedStatus: assignment.status,
              answer: "recusada",
            },
            "Recusa registrada. O designador poderá escolher um substituto.",
          )
        }
      >
        Não poderei participar
      </button>
    </div>
  );
}
export function ReplacementSuggestions({
  data,
  meeting,
  assignment,
  choose,
}: {
  data: Workspace;
  meeting: Meeting;
  assignment: StoredAssignment;
  choose: (id: string) => void;
}) {
  const candidates = rankCandidates(
    engineInput(data, meeting),
    assignment.partId,
  ).slice(0, 3);
  return (
    <div className="mt-3 rounded-xl border border-accent/40 bg-accent/5 p-4">
      <p className="font-semibold">
        {data.members.find((m) => m.id === assignment.memberId)?.name ??
          "A pessoa"}{" "}
        recusou esta parte.
      </p>
      <p className="mt-2 text-muted">
        Escolha um substituto e salve a reunião. A nova designação aguardará
        confirmação.
      </p>
      {candidates.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {candidates.map((c) => (
            <button
              type="button"
              className={secondary}
              key={c.memberId}
              onClick={() => choose(c.memberId)}
            >
              Sugerido: {data.members.find((m) => m.id === c.memberId)?.name}
            </button>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-muted">
          Não há substituto disponível. Revise o cadastro, as indisponibilidades
          e as outras partes da reunião.
        </p>
      )}
    </div>
  );
}
