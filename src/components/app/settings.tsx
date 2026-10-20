"use client";
import { useState, type FormEvent } from "react";
import { eligibilityRules, type EligibilityRule } from "@/lib/suggest";
import { newSlot, newTemplate } from "@/lib/app/defaults";
import {
  kindLabels,
  roleLabels,
  ruleLabels,
  type Membership,
  type Slot,
  type Template,
  type Workspace,
} from "@/lib/app/types";
import { ThemeToggle } from "../theme-toggle";
import type { Run } from "./week";
import { button, field, Label, Panel, secondary } from "./ui";
export function Settings({
  data,
  run,
  busy,
}: {
  data: Workspace;
  run: Run;
  busy: boolean;
}) {
  const [editing, setEditing] = useState<Template | null>(null),
    staff = data.membership.role !== "irmao";
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold">Ajustes</h1>
      <Panel>
        <h2 className="text-xl font-bold">Sua experiência</h2>
        <p className="my-3 text-muted">
          {data.congregation.name} · {roleLabels[data.membership.role]}
        </p>
        <ThemeToggle />
        <p className="mt-4 text-muted">
          Fuso das reuniões: {data.congregation.timezone}
        </p>
      </Panel>
      {staff && (
        <>
          <Panel>
            <h2 className="text-xl font-bold">Modelos de reunião</h2>
            <p className="my-3 text-muted">
              Ajuste dia, horário e partes. Mudanças de regra valem também para
              as reuniões futuras já criadas. Títulos e horários novos valem
              para as próximas semanas geradas.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                className={secondary}
                onClick={() => setEditing(newTemplate("meio_de_semana"))}
              >
                Novo modelo · meio de semana
              </button>
              <button
                className={secondary}
                onClick={() => setEditing(newTemplate("fim_de_semana"))}
              >
                Novo modelo · fim de semana
              </button>
            </div>
            <ul className="mt-4 space-y-3">
              {data.templates.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <span>
                    {t.name} · {t.time}
                  </span>
                  <button
                    className={secondary}
                    onClick={() => setEditing(structuredClone(t))}
                  >
                    Editar {t.name}
                  </button>
                </li>
              ))}
            </ul>
          </Panel>
          {editing && (
            <TemplateEditor
              key={editing.id}
              template={editing}
              isNew={!data.templates.some((t) => t.id === editing.id)}
              run={run}
              busy={busy}
              close={() => setEditing(null)}
            />
          )}
        </>
      )}
      {data.membership.role === "administrador" && (
        <MembershipEditor data={data} run={run} busy={busy} />
      )}
    </div>
  );
}
function TemplateEditor({
  template,
  isNew,
  run,
  busy,
  close,
}: {
  template: Template;
  isNew: boolean;
  run: Run;
  busy: boolean;
  close: () => void;
}) {
  const [value, setValue] = useState(template);
  function changeSlot(id: string, changes: Partial<Slot>) {
    setValue((v) => ({
      ...v,
      parts: v.parts.map((p) => (p.id === id ? { ...p, ...changes } : p)),
    }));
  }
  function move(index: number, direction: number) {
    setValue((v) => {
      const parts = [...v.parts];
      [parts[index], parts[index + direction]] = [
        parts[index + direction],
        parts[index],
      ];
      return { ...v, parts };
    });
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (
      await run(
        { type: "template", value, isNew },
        "Modelo salvo. Regras de reuniões futuras foram revalidadas.",
      )
    )
      close();
  }
  return (
    <Panel>
      <h2 className="text-xl font-bold">
        {isNew ? "Novo modelo" : "Editar modelo"}
      </h2>
      <form className="mt-4 space-y-4" onSubmit={submit}>
        <Label title="Nome do modelo">
          <input
            className={field}
            required
            maxLength={120}
            value={value.name}
            onChange={(e) => setValue({ ...value, name: e.target.value })}
          />
        </Label>
        <Label title="Tipo de reunião">
          <select
            className={field}
            value={value.kind}
            onChange={(e) =>
              setValue({ ...value, kind: e.target.value as Template["kind"] })
            }
          >
            {Object.entries(kindLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Label>
        <div className="grid grid-cols-2 gap-3">
          <Label title="Dia da semana">
            <select
              className={field}
              value={value.weekday}
              onChange={(e) =>
                setValue({ ...value, weekday: Number(e.target.value) })
              }
            >
              {[
                "Domingo",
                "Segunda-feira",
                "Terça-feira",
                "Quarta-feira",
                "Quinta-feira",
                "Sexta-feira",
                "Sábado",
              ].map((day, i) => (
                <option key={day} value={i}>
                  {day}
                </option>
              ))}
            </select>
          </Label>
          <Label title="Horário">
            <input
              className={field}
              type="time"
              required
              value={value.time}
              onChange={(e) => setValue({ ...value, time: e.target.value })}
            />
          </Label>
        </div>
        {value.parts.map((p, index) => (
          <fieldset
            key={p.id}
            className="space-y-3 rounded-xl border border-muted/30 p-4"
          >
            <legend className="px-2 font-bold">Parte {index + 1}</legend>
            <Label title="Título da parte">
              <input
                className={field}
                required
                maxLength={160}
                value={p.title}
                onChange={(e) => changeSlot(p.id, { title: e.target.value })}
              />
            </Label>
            <Label title="Seção">
              <input
                className={field}
                required
                value={p.section}
                onChange={(e) => changeSlot(p.id, { section: e.target.value })}
              />
            </Label>
            <Label title="Elegibilidade">
              <select
                className={field}
                value={p.eligibility}
                onChange={(e) =>
                  changeSlot(p.id, {
                    eligibility: e.target.value as EligibilityRule,
                  })
                }
              >
                {eligibilityRules.map((r) => (
                  <option key={r} value={r}>
                    {ruleLabels[r]}
                  </option>
                ))}
              </select>
            </Label>
            <Label title="Função">
              <select
                className={field}
                value={p.slot}
                onChange={(e) =>
                  changeSlot(p.id, { slot: e.target.value as Slot["slot"] })
                }
              >
                {["titular", "ajudante", "dirigente", "leitor"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Label>
            <Label title="Grupo da demonstração ou estudo (opcional)">
              <input
                className={field}
                value={p.groupKey ?? ""}
                onChange={(e) =>
                  changeSlot(p.id, { groupKey: e.target.value || null })
                }
              />
            </Label>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={p.allowsVisitor}
                onChange={(e) =>
                  changeSlot(p.id, { allowsVisitor: e.target.checked })
                }
              />
              Permitir orador visitante
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                className={secondary}
                type="button"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                aria-label={`Mover parte ${index + 1} para cima`}
              >
                ↑
              </button>
              <button
                className={secondary}
                type="button"
                disabled={index === value.parts.length - 1}
                onClick={() => move(index, 1)}
                aria-label={`Mover parte ${index + 1} para baixo`}
              >
                ↓
              </button>
              <button
                className={secondary}
                type="button"
                disabled={value.parts.length === 1}
                onClick={() =>
                  setValue((v) => ({
                    ...v,
                    parts: v.parts.filter((s) => s.id !== p.id),
                  }))
                }
              >
                Remover parte {index + 1}
              </button>
            </div>
          </fieldset>
        ))}
        <button
          className={secondary}
          type="button"
          onClick={() =>
            setValue((v) => ({ ...v, parts: [...v.parts, newSlot()] }))
          }
        >
          Adicionar parte
        </button>
        <div className="flex flex-wrap gap-2">
          <button className={button} disabled={busy}>
            Salvar modelo
          </button>
          <button type="button" className={secondary} onClick={close}>
            Cancelar
          </button>
        </div>
      </form>
    </Panel>
  );
}
function MembershipEditor({
  data,
  run,
  busy,
}: {
  data: Workspace;
  run: Run;
  busy: boolean;
}) {
  const [value, setValue] = useState<Membership>({
    congregationId: data.congregation.id,
    userId: "",
    memberId: "",
    role: "irmao",
  });
  async function submit(e: FormEvent) {
    e.preventDefault();
    await run(
      { type: "membership", value },
      "Perfil vinculado. A pessoa já pode entrar com a conta criada no Supabase Auth.",
    );
  }
  return (
    <Panel>
      <h2 className="text-xl font-bold">Perfis e acesso</h2>
      <p className="my-3 text-muted">
        Crie ou convide a conta no Supabase Auth e vincule o UUID do usuário ao
        cadastro. Só o administrador altera perfis.
      </p>
      <ul className="mb-5 space-y-2">
        {data.memberships.map((m) => (
          <li key={m.userId}>
            {data.members.find((p) => p.id === m.memberId)?.name ?? "Cadastro"}{" "}
            · {roleLabels[m.role]}{" "}
            <button className={secondary} onClick={() => setValue(m)}>
              Editar vínculo
            </button>
          </li>
        ))}
      </ul>
      <form className="grid gap-3" onSubmit={submit}>
        <Label title="UUID do usuário no Auth">
          <input
            className={field}
            required
            pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
            value={value.userId}
            onChange={(e) => setValue({ ...value, userId: e.target.value })}
          />
        </Label>
        <Label title="Cadastro vinculado">
          <select
            required
            className={field}
            value={value.memberId}
            onChange={(e) => setValue({ ...value, memberId: e.target.value })}
          >
            <option value="">Escolha a pessoa</option>
            {data.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Label>
        <Label title="Perfil">
          <select
            className={field}
            value={value.role}
            onChange={(e) =>
              setValue({ ...value, role: e.target.value as Membership["role"] })
            }
          >
            {Object.entries(roleLabels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </Label>
        <button disabled={busy} className={button}>
          Salvar vínculo
        </button>
      </form>
    </Panel>
  );
}
