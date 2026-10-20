"use client";
import { useState, type FormEvent } from "react";
import { categories, type Category } from "@/lib/suggest";
import {
  categoryLabels,
  type MemberDraft,
  type Person,
  type Workspace,
} from "@/lib/app/types";
import type { Run } from "./week";
import { button, Empty, field, Label, Panel, secondary } from "./ui";
export function Members({
  data,
  run,
  busy,
}: {
  data: Workspace;
  run: Run;
  busy: boolean;
}) {
  const [search, setSearch] = useState(""),
    [edit, setEdit] = useState<Person | null | undefined>(),
    staff = data.membership.role !== "irmao";
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-bold">
          {staff ? "Irmãos" : "Meu cadastro"}
        </h1>
        <p className="mt-2 text-muted">
          Disponibilidade atualizada ajuda a preparar uma boa semana.
        </p>
      </header>
      {staff && (
        <>
          <button className={button} onClick={() => setEdit(null)}>
            Adicionar pessoa
          </button>
          <Label title="Buscar irmãos">
            <input
              type="search"
              className={field}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome da pessoa"
            />
          </Label>
        </>
      )}
      {edit !== undefined && (
        <MemberForm
          key={edit?.id ?? "new"}
          person={edit}
          run={run}
          busy={busy}
          close={() => setEdit(undefined)}
        />
      )}
      {data.members.length === 0 && (
        <Empty>
          Adicione os irmãos e suas categorias para começar a sugerir
          designações.
        </Empty>
      )}
      {data.members
        .filter((p) =>
          p.name
            .toLocaleLowerCase("pt-BR")
            .includes(search.toLocaleLowerCase("pt-BR")),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((person) => (
          <Panel key={person.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">{person.name}</h2>
                <p className="mt-1 text-muted">
                  {categoryLabels[person.category]}
                  {person.isVisitor ? " · Visitante" : ""}
                  {!person.active ? " · Inativo" : ""}
                </p>
                {staff && person.whatsapp && (
                  <p className="mt-1 text-muted">
                    WhatsApp: +{person.whatsapp}
                  </p>
                )}
              </div>
              {staff && (
                <button className={secondary} onClick={() => setEdit(person)}>
                  Editar {person.name}
                </button>
              )}
            </div>
            <Availability person={person} run={run} busy={busy} />
          </Panel>
        ))}
    </div>
  );
}
function MemberForm({
  person,
  run,
  busy,
  close,
}: {
  person: Person | null;
  run: Run;
  busy: boolean;
  close: () => void;
}) {
  const [value, setValue] = useState<MemberDraft>({
    id: person?.id ?? null,
    name: person?.name ?? "",
    category: person?.category ?? "irmao_batizado",
    active: person?.active ?? true,
    isVisitor: person?.isVisitor ?? false,
    whatsapp: person?.whatsapp ?? "",
  });
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (
      await run(
        { type: "member", value },
        "Cadastro salvo. Designações incompatíveis foram removidas.",
      )
    )
      close();
  }
  return (
    <Panel>
      <h2 className="text-xl font-bold">
        {person ? "Editar cadastro" : "Novo cadastro"}
      </h2>
      <form onSubmit={submit} className="mt-4 grid gap-4">
        <Label title="Nome">
          <input
            className={field}
            required
            maxLength={120}
            value={value.name}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
        </Label>
        <Label title="Categoria">
          <select
            className={field}
            value={value.category}
            onChange={(e) =>
              setValue({ ...value, category: e.target.value as Category })
            }
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {categoryLabels[c]}
              </option>
            ))}
          </select>
        </Label>
        <Label title="WhatsApp com país e DDD (opcional)">
          <input
            className={field}
            type="tel"
            placeholder="Ex.: 55 11 00000 0000"
            value={value.whatsapp}
            onChange={(e) => setValue({ ...value, whatsapp: e.target.value })}
          />
        </Label>
        <p className="text-muted">
          O telefone fica visível apenas para administradores e designadores.
        </p>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={value.active}
            onChange={(e) => setValue({ ...value, active: e.target.checked })}
          />
          Cadastro ativo
        </label>
        <label className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            checked={value.isVisitor}
            onChange={(e) =>
              setValue({ ...value, isVisitor: e.target.checked })
            }
          />
          Orador visitante
        </label>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} className={button}>
            Salvar cadastro
          </button>
          <button type="button" className={secondary} onClick={close}>
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}
function Availability({
  person,
  run,
  busy,
}: {
  person: Person;
  run: Run;
  busy: boolean;
}) {
  const [start, setStart] = useState(""),
    [end, setEnd] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (
      await run(
        {
          type: "availability",
          memberId: person.id,
          startsOn: start,
          endsOn: end,
        },
        "Indisponibilidade salva. Designações conflitantes foram removidas.",
      )
    ) {
      setStart("");
      setEnd("");
    }
  }
  return (
    <details className="mt-4">
      <summary className="min-h-11 cursor-pointer py-2 font-semibold text-accent">
        Indisponibilidade ({person.unavailability.length})
      </summary>
      <ul className="my-3 space-y-2">
        {person.unavailability.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2"
          >
            <span>
              {r.startsOn.split("-").reverse().join("/")} a{" "}
              {r.endsOn.split("-").reverse().join("/")}
            </span>
            <button
              className={secondary}
              disabled={busy}
              onClick={() =>
                void run(
                  { type: "removeAvailability", id: r.id },
                  "Intervalo removido.",
                )
              }
            >
              Remover intervalo
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Label title={`Início · ${person.name}`}>
          <input
            type="date"
            required
            className={field}
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Label>
        <Label title={`Fim · ${person.name}`}>
          <input
            type="date"
            required
            min={start}
            className={field}
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </Label>
        <button className={secondary} disabled={busy}>
          Adicionar indisponibilidade
        </button>
      </form>
    </details>
  );
}
