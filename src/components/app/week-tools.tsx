"use client";
import { useState } from "react";
import { weeklyDocument } from "@/lib/app/weekly-document";
import { downloadWeeklyPng, printWeekly } from "@/lib/app/export";
import {
  clearOfflineSnapshot,
  OFFLINE_TTL,
  saveOfflineSnapshot,
} from "@/lib/app/offline";
import { friendlyError } from "@/lib/app/domain";
import type { Workspace } from "@/lib/app/types";
import { Panel, secondary } from "./ui";
export function WeekTools({
  data,
  monday,
}: {
  data: Workspace;
  monday: string;
}) {
  const [consent, setConsent] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false);
  const doc = weeklyDocument(data, monday),
    empty = doc.meetings.length === 0;
  async function action(task: () => Promise<void> | void, success: string) {
    setWorking(true);
    setError("");
    try {
      await task();
      setMessage(success);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setWorking(false);
    }
  }
  return (
    <Panel>
      <h2 className="text-xl font-bold">Leve o quadro com você</h2>
      <p className="my-3 text-muted">
        Exporta as designações salvas, sem telefones. Rascunhos ainda não salvos
        ficam de fora.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          disabled={empty || working}
          className={secondary}
          onClick={() =>
            void action(
              () => printWeekly(doc),
              "Quadro aberto. Na nova janela, use Salvar como PDF / imprimir.",
            )
          }
        >
          Exportar PDF
        </button>
        <button
          disabled={empty || working}
          className={secondary}
          onClick={() =>
            void action(
              () => downloadWeeklyPng(doc),
              "Imagem PNG preparada para baixar.",
            )
          }
        >
          Baixar imagem
        </button>
      </div>
      <details className="mt-4">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-accent">
          Consultar sem internet
        </summary>
        <p className="mt-2 text-muted">
          Salve uma cópia desta semana por até 24 horas, somente para leitura.
          Nomes e designações ficarão neste dispositivo, acessíveis a quem o
          utilizar. A cópia não recebe atualizações automaticamente.
        </p>
        <label className="my-3 flex min-h-11 items-center gap-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          Este dispositivo é de confiança e desejo guardar esta semana.
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            className={secondary}
            disabled={!consent || empty || working}
            onClick={() =>
              void action(async () => {
                const now = Date.now();
                await saveOfflineSnapshot({
                  version: 1,
                  userId: data.membership.userId,
                  congregationId: data.congregation.id,
                  role: data.membership.role,
                  createdAt: now,
                  expiresAt: now + OFFLINE_TTL,
                  document: doc,
                });
              }, "Semana salva para consulta offline por até 24 horas. Nenhum telefone foi guardado.")
            }
          >
            {working ? "Preparando…" : "Salvar semana offline"}
          </button>
          <a className={secondary} href="/offline.html">
            Abrir cópia salva
          </a>
          <button
            className={secondary}
            onClick={() => {
              clearOfflineSnapshot();
              setMessage("Cópia offline apagada deste dispositivo.");
            }}
          >
            Apagar cópia offline
          </button>
        </div>
      </details>
      <p role="status" className="mt-3 text-accent">
        {message}
      </p>
      {error && (
        <p role="alert" className="mt-3 text-red-800 dark:text-red-300">
          {error}
        </p>
      )}
    </Panel>
  );
}
