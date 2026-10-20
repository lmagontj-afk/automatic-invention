"use client";
import { useState } from "react";
export function ThemeToggle() {
  const [announcement, setAnnouncement] = useState("");
  function toggle() {
    const dark = document.documentElement.classList.toggle("dark");
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch { /* O tema continua funcionando sem armazenamento. */ }
    setAnnouncement(`Tema ${dark ? "escuro" : "claro"} ativado.`);
  }
  return <div><button type="button" onClick={toggle} className="rounded-xl border border-accent px-4 py-2 font-semibold text-accent">Alternar tema</button><span role="status" className="sr-only">{announcement}</span></div>;
}
