"use client";
import { useState } from "react";
import {
  whatsAppTransport,
  weeklyNotices,
  type Notice,
  type NotificationTransport,
} from "@/lib/notifications";
import type { Workspace } from "@/lib/app/types";
import { Panel, secondary } from "./ui";
export function NotifyLink({
  notice,
  transport = whatsAppTransport,
}: {
  notice: Notice;
  transport?: NotificationTransport;
}) {
  const [opened, setOpened] = useState(false);
  let prepared;
  try {
    prepared = transport.prepare(notice);
  } catch {
    return (
      <p className="my-2 text-muted">
        WhatsApp não cadastrado ou inválido. Corrija o cadastro em Irmãos.
      </p>
    );
  }
  return (
    <div className="mt-3">
      <a
        className={secondary}
        href={prepared.href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => setOpened(true)}
      >
        Abrir WhatsApp · {notice.name}
      </a>
      {opened && (
        <p role="status" className="mt-2 text-accent">
          Link aberto. Revise a mensagem e toque em enviar no WhatsApp.
        </p>
      )}
    </div>
  );
}
export function WeekNotifications({
  data,
  meetingIds,
}: {
  data: Workspace;
  meetingIds: string[];
}) {
  const [open, setOpen] = useState(false),
    notices = weeklyNotices(data, meetingIds);
  return (
    <Panel>
      <h2 className="text-xl font-bold">Avisos da semana</h2>
      <p className="my-3 text-muted">
        {notices.length} pessoa(s) com confirmação pendente. Cada link reúne as
        partes da pessoa nesta semana.
      </p>
      <button className={secondary} onClick={() => setOpen((v) => !v)}>
        {open ? "Fechar lista de avisos" : "Avisar todos da semana"}
      </button>
      {open && (
        <>
          <p className="mt-4 text-muted">
            Abra cada conversa para revisar e enviar. Não há envio automático
            nem alteração das confirmações.
          </p>
          {notices.length === 0 ? (
            <p className="mt-3 text-muted">
              Não há avisos pendentes. Salve as designações ou confira as
              respostas recebidas.
            </p>
          ) : (
            <ul className="mt-4 space-y-4">
              {notices.map((n) => (
                <li className="border-t border-muted/20 pt-3" key={n.memberId}>
                  <p className="font-semibold">
                    {n.name} · {n.items.length} parte(s)
                  </p>
                  <NotifyLink notice={n} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}
