import type { Metadata, Viewport } from "next";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";
export const metadata: Metadata = { title: "Quadro semanal", description: "Organize as designações das reuniões da sua congregação.", applicationName: "Quadro semanal", appleWebApp: { capable: true, title: "Quadro semanal" }, icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: [{ media: "(prefers-color-scheme: light)", color: "#f7f8fc" }, { media: "(prefers-color-scheme: dark)", color: "#101626" }] };
const themeScript = `(function(){var t=null;try{t=localStorage.getItem('theme')}catch(e){}var d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d)})()`;
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body><a href="#conteudo" className="sr-only focus:not-sr-only focus:block focus:p-4">Pular para o conteúdo</a>{children}<PwaRegister /></body></html>;
}
