"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { createDemo, applyDemo, brotherView } from "@/lib/app/demo";
import { friendlyError, localDate, mondayOf } from "@/lib/app/domain";
import { execute, loadWorkspace, membership } from "@/lib/app/repository";
import type { Command, Membership, Workspace } from "@/lib/app/types";
import { Members } from "./members";
import { Week } from "./week";
import { Settings } from "./settings";
import { History } from "./history";
import { button, field, Label, Panel, secondary } from "./ui";
const navigation = [
  ["week", "Semana", "▦"],
  ["members", "Irmãos", "♙"],
  ["history", "Histórico", "◷"],
  ["settings", "Ajustes", "⚙"],
] as const;
export function Application() {
  const lastUser = useRef<string | null>(null);
  const [client] = useState(() =>
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ? createClient()
      : null,
  );
  const [user, setUser] = useState<string | null>(null),
    [data, setData] = useState<Workspace | null>(null),
    [choices, setChoices] = useState<Membership[]>([]),
    [selected, setSelected] = useState<Membership | null>(null),
    [demo, setDemo] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [tab, setTab] = useState<(typeof navigation)[number][0]>("week"),
    [monday, setMonday] = useState("");
  useEffect(() => {
    if (!client) return;
    void client.auth
      .getUser()
      .then(({ data }) => setUser(data.user?.id ?? null));
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (next !== lastUser.current) {
        setData(null);
        setSelected(null);
        setChoices([]);
        lastUser.current = next;
      }
      setUser(next);
    });
    return () => subscription.unsubscribe();
  }, [client]);
  useEffect(() => {
    if (!client || !user || demo) return;
    let cancelled = false;
    void client
      .from("congregation_memberships")
      .select("*")
      .eq("user_id", user)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          setError(friendlyError(error));
          return;
        }
        const options = (data ?? []).map(membership);
        setChoices(options);
        setSelected(options[0] ?? null);
        if (!options.length)
          setError(
            "Sua conta ainda não tem vínculo com uma congregação. Peça ao administrador para associar seu cadastro em Ajustes.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [client, user, demo]);
  const refresh = useCallback(async () => {
    if (!client || !selected || demo) return;
    setBusy(true);
    setError("");
    try {
      const next = await loadWorkspace(client, selected);
      setData(next);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }, [client, selected, demo]);
  useEffect(() => {
    let cancelled = false;
    if (!client || !selected || demo) return;
    void loadWorkspace(client, selected)
      .then((next) => {
        if (!cancelled) {
          setData(next);
          setMonday(
            mondayOf(
              localDate(new Date().toISOString(), next.congregation.timezone),
            ),
          );
        }
      })
      .catch((e) => {
        if (!cancelled) setError(friendlyError(e));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, selected, demo]);
  useEffect(() => {
    if (!client || !selected || demo) return;
    const channel = client
      .channel(`quadro-${selected.congregationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "meetings",
          filter: `congregation_id=eq.${selected.congregationId}`,
        },
        () => {
          setMessage(
            "Há atualizações no quadro. Use Atualizar para carregar a versão mais recente.",
          );
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [client, selected, demo]);
  async function run(command: Command, success: string) {
    if (!data || busy) return false;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (demo) setData(applyDemo(data, command));
      else {
        if (!client || !selected)
          throw new Error("Entre novamente para salvar.");
        await execute(client, data.congregation.id, command);
        try {
          setData(await loadWorkspace(client, selected));
        } catch (e) {
          setError(
            `A alteração foi salva, mas os dados não puderam ser atualizados. Use Atualizar antes de editar novamente. ${friendlyError(e)}`,
          );
          return true;
        }
      }
      setMessage(
        `${success}${demo ? " Apenas na demonstração; nenhum dado foi enviado." : ""}`,
      );
      return true;
    } catch (e) {
      setError(friendlyError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function login(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!client) return;
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const { error } = await client.auth.signInWithPassword({
        email: String(form.get("email")),
        password: String(form.get("password")),
      });
      if (error)
        throw new Error(
          "Não foi possível entrar. Confira o e-mail e a senha, ou peça ao administrador para revisar sua conta.",
        );
      setMessage("Sessão iniciada.");
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    if (client && !demo) {
      setBusy(true);
      const { error } = await client.auth.signOut();
      if (error) {
        setError(
          "Não foi possível sair. Verifique a conexão e tente novamente.",
        );
        setBusy(false);
        return;
      }
    }
    setData(null);
    setDemo(false);
    setSelected(null);
    setChoices([]);
    setMessage("Sessão encerrada.");
    setError("");
    setBusy(false);
  }
  function startDemo() {
    const week = mondayOf(
      localDate(new Date().toISOString(), "America/Sao_Paulo"),
    );
    setMonday(week);
    setDemo(true);
    setData(createDemo(week));
    setMessage(
      "Demonstração aberta. Todos os nomes são fictícios e as alterações duram até sair ou recarregar.",
    );
    setError("");
  }
  const visibleData =
    data && demo && data.membership.role === "irmao" ? brotherView(data) : data;
  return (
    <>
      <div className="mx-auto max-w-3xl px-4 pb-28 pt-6 sm:px-6">
        <header className="mb-7 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/"
            className="flex items-center gap-3 font-bold tracking-tight"
          >
            <span
              className="flex size-11 items-center justify-center rounded-xl bg-accent text-2xl text-white dark:text-background"
              aria-hidden="true"
            >
              ▦
            </span>
            Quadro semanal
          </Link>
          {data && (
            <button
              className={secondary}
              disabled={busy}
              onClick={() => void logout()}
            >
              Sair
            </button>
          )}
        </header>
        <div
          role="status"
          aria-live="polite"
          className={
            message
              ? "mb-4 rounded-xl border border-accent/30 bg-accent/5 p-4"
              : "sr-only"
          }
        >
          {message}
        </div>
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-700 bg-red-50 p-4 text-red-900 dark:bg-red-950 dark:text-red-100"
          >
            {error}
            <p className="mt-2">
              <button
                className="underline"
                disabled={busy}
                onClick={() => void refresh()}
              >
                Atualizar dados
              </button>
            </p>
          </div>
        )}
        {!data ? (
          <main id="conteudo" className="space-y-6">
            <div className="py-4">
              <p className="font-semibold text-accent">
                Cada parte, no seu lugar.
              </p>
              <h1 className="mt-3 text-4xl font-bold">
                Uma semana bem preparada.
              </h1>
              <p className="mt-4 text-lg text-muted">
                Organize as reuniões, escolha quem participa e acompanhe cada
                designação.
              </p>
            </div>
            <Panel>
              <h2 className="text-xl font-bold">Entrar na congregação</h2>
              {!client ? (
                <p className="mt-3 text-muted">
                  A conexão ainda não foi configurada. Preencha as variáveis
                  públicas do Supabase em .env.local e reinicie o aplicativo.
                  Enquanto isso, você pode experimentar a demonstração.
                </p>
              ) : user ? (
                <p className="mt-3 text-muted">
                  {busy
                    ? "Carregando sua congregação…"
                    : "Verificando os vínculos da sua conta…"}
                </p>
              ) : (
                <form className="mt-4 grid gap-4" onSubmit={login}>
                  <Label title="E-mail">
                    <input
                      className={field}
                      name="email"
                      type="email"
                      autoComplete="username"
                      required
                    />
                  </Label>
                  <Label title="Senha">
                    <input
                      className={field}
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                    />
                  </Label>
                  <button className={button} disabled={busy}>
                    {busy ? "Entrando…" : "Entrar"}
                  </button>
                  <p className="text-muted">
                    Use a conta criada pelo administrador. Se esqueceu a senha,
                    peça a ele um novo acesso pelo Supabase Auth.
                  </p>
                </form>
              )}
            </Panel>
            <Panel>
              <h2 className="text-xl font-bold">Conheça antes de começar</h2>
              <p className="my-3 text-muted">
                Experimente o quadro com uma congregação e pessoas inteiramente
                fictícias.
              </p>
              <button className={secondary} disabled={busy} onClick={startDemo}>
                Abrir demonstração
              </button>
            </Panel>
            {user && (
              <button className={secondary} onClick={() => void logout()}>
                Sair desta conta
              </button>
            )}
          </main>
        ) : (
          <>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="font-bold text-accent">
                  {data.congregation.name}
                </p>
                {demo && (
                  <p className="text-muted">Demonstração · dados fictícios</p>
                )}
              </div>
              {demo && (
                <button
                  className={secondary}
                  onClick={() => {
                    setData({
                      ...data,
                      membership: {
                        ...data.membership,
                        role:
                          data.membership.role === "irmao"
                            ? "administrador"
                            : "irmao",
                      },
                    });
                    setTab("week");
                    setMessage("Perfil de demonstração alterado.");
                  }}
                >
                  {data.membership.role === "irmao"
                    ? "Voltar à administração"
                    : "Simular perfil de irmão"}
                </button>
              )}
              {!demo && (
                <button
                  className={secondary}
                  disabled={busy}
                  onClick={() => void refresh()}
                >
                  {busy ? "Atualizando…" : "Atualizar"}
                </button>
              )}
              {!demo && choices.length > 1 && (
                <Label title="Congregação">
                  <select
                    className={field}
                    value={data.congregation.id}
                    onChange={(e) => {
                      setData(null);
                      setSelected(
                        choices.find(
                          (c) => c.congregationId === e.target.value,
                        )!,
                      );
                    }}
                  >
                    {choices.map((c) => (
                      <option key={c.congregationId} value={c.congregationId}>
                        {c.congregationId}
                      </option>
                    ))}
                  </select>
                </Label>
              )}
            </div>
            <main id="conteudo" aria-busy={busy}>
              {tab === "week" && (
                <Week
                  data={visibleData!}
                  monday={monday}
                  setMonday={(date) => setMonday(mondayOf(date))}
                  run={run}
                  busy={busy}
                />
              )}{" "}
              {tab === "members" && (
                <Members data={visibleData!} run={run} busy={busy} />
              )}{" "}
              {tab === "history" && <History data={visibleData!} />}{" "}
              {tab === "settings" && (
                <Settings data={visibleData!} run={run} busy={busy} />
              )}
            </main>
          </>
        )}
      </div>
      {data && (
        <nav
          aria-label="Navegação principal"
          className="fixed inset-x-0 bottom-0 z-10 border-t border-muted/20 bg-surface pb-[env(safe-area-inset-bottom)]"
        >
          <div className="mx-auto grid max-w-3xl grid-cols-4">
            {navigation.map(([key, label, icon]) => (
              <button
                key={key}
                className={`flex min-h-20 flex-col items-center justify-center gap-1 px-1 py-2 font-semibold ${tab === key ? "bg-accent/10 text-accent" : "text-muted"}`}
                aria-current={tab === key ? "page" : undefined}
                onClick={() => setTab(key)}
              >
                <span aria-hidden="true" className="text-2xl">
                  {icon}
                </span>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
    </>
  );
}
