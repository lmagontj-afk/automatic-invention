import type { ReactNode } from "react";
export const button =
  "app-primary inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-4 py-2 font-semibold text-white dark:text-background disabled:cursor-wait disabled:opacity-50";
export const secondary =
  "app-secondary inline-flex min-h-11 items-center justify-center rounded-xl border border-muted/30 bg-surface px-4 py-2 font-medium disabled:opacity-50";
export const field =
  "w-full min-h-11 rounded-xl border border-muted/40 bg-surface px-3 py-2 text-base";
export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`app-panel rounded-2xl border border-muted/20 bg-surface p-5 shadow-sm ${className}`}
    >
      {children}
    </section>
  );
}
export function Label({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <label className="grid gap-2 text-base font-medium">
      {title}
      {children}
    </label>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <Panel>
      <p className="text-muted">{children}</p>
    </Panel>
  );
}
