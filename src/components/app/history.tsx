"use client";
import { useState } from "react";
import { dateLabel } from "@/lib/app/domain";
import type { Workspace } from "@/lib/app/types";
import { Empty, field, Label, Panel } from "./ui";
export function History({ data }: { data: Workspace }) {
  const [person, setPerson] = useState("");
  const events = data.audit
    .filter((a) => !person || a.memberId === person)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold">Histórico</h1>
      <p className="text-muted">
        Registro de criações, alterações e remoções de designações.
      </p>
      <Label title="Filtrar por pessoa">
        <select
          className={field}
          value={person}
          onChange={(e) => setPerson(e.target.value)}
        >
          <option value="">Todas as pessoas visíveis</option>
          {data.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </Label>
      {events.length === 0 ? (
        <Empty>
          Nenhuma alteração registrada. Salve as primeiras designações na tela
          Semana.
        </Empty>
      ) : (
        events.map((a) => {
          const m = data.meetings.find((m) => m.id === a.meetingId),
            p = m?.parts.find((p) => p.id === a.partId);
          return (
            <Panel key={a.id}>
              <p className="font-bold">
                {data.members.find((m) => m.id === a.memberId)?.name ??
                  "Cadastro não disponível"}
              </p>
              <p className="mt-1">
                {p?.title ?? "Parte anterior"} ·{" "}
                {a.action === "DELETE"
                  ? "Removida"
                  : a.action === "INSERT"
                    ? "Criada"
                    : "Atualizada"}
              </p>
              <p className="mt-1 text-muted">
                {m
                  ? dateLabel(m.startsAt, data.congregation.timezone)
                  : "Reunião anterior"}
              </p>
              <p className="mt-2 text-muted">
                Registro: {dateLabel(a.occurredAt, data.congregation.timezone)}{" "}
                · {a.status}
              </p>
            </Panel>
          );
        })
      )}
    </div>
  );
}
