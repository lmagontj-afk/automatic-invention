"use client";
import { useState } from "react";
import {
  rankCandidates,
  suggest,
  type Assignment,
  type EligibilityRule,
} from "@/lib/suggest";
import {
  addDays,
  conflicts,
  dateLabel,
  engineInput,
  weekMeetings,
} from "@/lib/app/domain";
import {
  kindLabels,
  ruleLabels,
  type Command,
  type Meeting,
  type Workspace,
} from "@/lib/app/types";
import { button, Empty, field, Label, Panel, secondary } from "./ui";
import { WeekTools } from "./week-tools";
import { ResponseButtons, ReplacementSuggestions } from "./responses";
import { NotifyLink, WeekNotifications } from "./notifications";
export type Run = (command: Command, message: string) => Promise<boolean>;
export function Week({
  data,
  monday,
  setMonday,
  run,
  busy,
}: {
  data: Workspace;
  monday: string;
  setMonday: (m: string) => void;
  run: Run;
  busy: boolean;
}) {
  const staff = data.membership.role !== "irmao",
    meetings = weekMeetings(data, monday);
  return (
    <div className="space-y-5">
      <header>
        <p className="font-medium text-muted">Uma semana de cada vez</p>
        <h1 className="text-3xl font-bold">Designações</h1>
      </header>
      <div className="flex flex-wrap items-end gap-2">
        <button
          className={secondary}
          onClick={() => setMonday(addDays(monday, -7))}
          aria-label="Semana anterior"
        >
          ←
        </button>
        <Label title="Semana de">
          <input
            type="date"
            className={field}
            value={monday}
            onChange={(e) => {
              if (e.target.value) setMonday(e.target.value);
            }}
          />
        </Label>
        <button
          className={secondary}
          onClick={() => setMonday(addDays(monday, 7))}
          aria-label="Próxima semana"
        >
          →
        </button>
      </div>
      {staff && (
        <button
          className={secondary}
          disabled={busy}
          onClick={() =>
            void run(
              { type: "week", monday },
              "Semana criada. As reuniões existentes foram mantidas.",
            )
          }
        >
          Criar reuniões da semana
        </button>
      )}
      {meetings.length === 0 && (
        <Empty>
          {staff
            ? "Nenhuma reunião nesta semana. Configure os modelos em Ajustes e crie as reuniões acima."
            : "Você não tem designações nesta semana. Use as setas para consultar outras semanas."}
        </Empty>
      )}
      <WeekTools data={data} monday={monday} />
      {staff && (
        <WeekNotifications data={data} meetingIds={meetings.map((m) => m.id)} />
      )}
      {meetings.map((m) => (
        <MeetingCard
          key={`${m.id}-${m.revision}-${data.membership.role}-${data.membership.memberId}`}
          data={data}
          meeting={m}
          run={run}
          busy={busy}
        />
      ))}
    </div>
  );
}
export function MeetingCard({
  data,
  meeting: m,
  run,
  busy,
}: {
  data: Workspace;
  meeting: Meeting;
  run: Run;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<Assignment[]>([
      ...engineInput(data, m).existing,
    ]),
    [search, setSearch] = useState<Record<string, string>>({}),
    [notice, setNotice] = useState("");
  const staff = data.membership.role !== "irmao";
  const preview = {
    ...data,
    assignments: [
      ...data.assignments.filter((a) => a.meetingId !== m.id),
      ...draft
        .filter((a) => a.memberId !== null)
        .map((a) => ({
          ...a,
          id: a.partId,
          meetingId: m.id,
          status:
            data.assignments.find(
              (s) => s.partId === a.partId && s.memberId === a.memberId,
            )?.status ?? ("pendente" as const),
        })),
    ],
  };
  const input = { ...engineInput(data, m), existing: draft },
    errors = conflicts(preview, m);
  function choose(partId: string, memberId: string | null) {
    setDraft((d) =>
      d.map((a) => (a.partId === partId ? { ...a, memberId } : a)),
    );
    setNotice("Alteração no rascunho. Salve a reunião para confirmar.");
  }
  function generate() {
    const result = suggest(input);
    if (result.status === "blocked")
      setNotice(result.conflicts.map((c) => c.message).join(" "));
    else {
      setDraft(result.assignments);
      setNotice(
        result.status === "complete"
          ? "Sugestões prontas. Revise e salve a reunião."
          : `${result.unfilled.length} parte(s) sem pessoa disponível. Revise as regras, as travas e o cadastro.`,
      );
    }
  }
  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-accent">{kindLabels[m.kind]}</p>
          <h2 className="mt-1 text-xl font-bold">{m.title}</h2>
          <p className="mt-1 text-muted">
            {dateLabel(m.startsAt, data.congregation.timezone)}
          </p>
        </div>
      </div>
      {staff && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button disabled={busy} className={secondary} onClick={generate}>
            Sugerir designados
          </button>
          <button
            disabled={busy || errors.length > 0}
            className={button}
            onClick={() =>
              void run(
                {
                  type: "assignments",
                  meetingId: m.id,
                  revision: m.revision,
                  rows: draft,
                },
                "Designações salvas. As pessoas alteradas estão pendentes de confirmação.",
              )
            }
          >
            Salvar reunião
          </button>
        </div>
      )}
      <p role="status" className="mt-3 text-accent">
        {notice}
      </p>
      {errors.length > 0 && (
        <ul
          role="alert"
          aria-label="Conflitos nesta reunião"
          className="rounded-xl border border-red-700 p-3 text-red-800 dark:text-red-300"
        >
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="mt-4 divide-y divide-muted/20">
        {m.parts.map((p, index) => {
          const a = draft.find((a) => a.partId === p.id)!,
            stored = data.assignments.find((a) => a.partId === p.id),
            person = data.members.find((person) => person.id === a.memberId),
            query = search[p.id] ?? "",
            ranked = rankCandidates(input, p.id),
            recommended = new Set(ranked.slice(0, 3).map((r) => r.memberId));
          return (
            <article key={p.id} className="py-5">
              <p className="font-medium text-muted">{p.section}</p>
              <h3 className="mt-1 font-bold">
                {index + 1}. {p.title}
              </h3>
              {staff ? (
                <>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Label title={`Buscar para ${p.title}`}>
                      <input
                        className={field}
                        type="search"
                        value={query}
                        placeholder="Digite um nome"
                        onChange={(e) =>
                          setSearch((s) => ({ ...s, [p.id]: e.target.value }))
                        }
                      />
                    </Label>
                    <Label title={`Designado para ${p.title}`}>
                      <select
                        className={field}
                        value={a.memberId ?? ""}
                        onChange={(e) => choose(p.id, e.target.value || null)}
                      >
                        <option value="">Escolher pessoa</option>
                        {data.members
                          .filter(
                            (person) =>
                              person.id === a.memberId ||
                              person.name
                                .toLocaleLowerCase("pt-BR")
                                .includes(query.toLocaleLowerCase("pt-BR")),
                          )
                          .sort(
                            (a, b) =>
                              Number(recommended.has(b.id)) -
                                Number(recommended.has(a.id)) ||
                              a.name.localeCompare(b.name, "pt-BR"),
                          )
                          .map((person) => (
                            <option key={person.id} value={person.id}>
                              {recommended.has(person.id) ? "★ " : ""}
                              {person.name}
                              {!person.active ? " (inativo)" : ""}
                            </option>
                          ))}
                      </select>
                    </Label>
                  </div>
                  <p className="mt-2 text-muted">
                    ★ Mais indicados entre os disponíveis
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label className="flex min-h-11 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={a.locked}
                        onChange={(e) =>
                          setDraft((d) =>
                            d.map((a) =>
                              a.partId === p.id
                                ? { ...a, locked: e.target.checked }
                                : a,
                            ),
                          )
                        }
                      />
                      Travar parte
                    </label>
                    <Label title={`Regra para ${p.title}`}>
                      <select
                        disabled={busy}
                        className={field}
                        value={p.eligibility}
                        onChange={(e) =>
                          void run(
                            {
                              type: "rule",
                              meetingId: m.id,
                              partId: p.id,
                              rule: e.target.value as EligibilityRule,
                            },
                            "Regra salva. Designados que deixaram de ser elegíveis foram removidos.",
                          )
                        }
                      >
                        {Object.entries(ruleLabels).map(([v, label]) => (
                          <option key={v} value={v}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </Label>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-lg font-semibold">
                  {person?.name ?? "Sem designado"}
                </p>
              )}
              {stored && (
                <p className="mt-3 inline-block rounded-lg bg-accent/10 px-3 py-1 font-medium text-accent">
                  {stored.status === "confirmada"
                    ? "Confirmada"
                    : stored.status === "recusada"
                      ? "Recusada"
                      : "Aguardando confirmação"}
                </p>
              )}
              {stored && (
                <ResponseButtons
                  data={data}
                  assignment={stored}
                  meeting={m}
                  run={run}
                  busy={busy}
                />
              )}
              {staff && stored?.status === "recusada" && (
                <ReplacementSuggestions
                  data={preview}
                  meeting={m}
                  assignment={stored}
                  choose={(id) => choose(p.id, id)}
                />
              )}
              {staff &&
                stored?.status === "pendente" &&
                person &&
                stored.memberId === a.memberId && (
                  <NotifyLink
                    notice={{
                      memberId: person.id,
                      name: person.name,
                      phone: person.whatsapp,
                      timezone: data.congregation.timezone,
                      items: [
                        {
                          part: p.title,
                          meeting: m.title,
                          startsAt: m.startsAt,
                        },
                      ],
                    }}
                  />
                )}
            </article>
          );
        })}
      </div>
    </Panel>
  );
}
