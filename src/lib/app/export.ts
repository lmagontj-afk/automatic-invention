import {
  documentLines,
  wrapText,
  type WeeklyDocument,
} from "./weekly-document";
export function printWeekly(doc: WeeklyDocument) {
  const popup = window.open("", "_blank");
  if (!popup)
    throw new Error("Permita abrir a janela de impressão e tente novamente.");
  popup.opener = null;
  const page = popup.document;
  page.title = `Quadro semanal · ${doc.monday}`;
  page.documentElement.lang = "pt-BR";
  const style = page.createElement("style");
  style.textContent =
    "body{font:16px/1.5 Arial,sans-serif;color:#282c2e;max-width:800px;margin:32px auto;padding:16px}h1{color:#8e1939}h2{margin-top:32px}article{break-inside:avoid;border-bottom:1px solid #ccc;padding:10px 0}p{margin:4px 0}button{min-height:44px;font:inherit;padding:10px 20px;border:2px solid #8e1939;border-radius:8px;background:white;color:#8e1939} @media print{button{display:none}body{margin:0;padding:0}@page{size:A4;margin:16mm}}";
  page.head.append(style);
  const add = (parent: HTMLElement, tag: string, text: string) => {
    const element = page.createElement(tag);
    element.textContent = text;
    parent.append(element);
    return element;
  };
  const action = add(page.body, "button", "Salvar como PDF / imprimir");
  action.onclick = () => popup.print();
  add(page.body, "h1", "Quadro semanal");
  add(page.body, "p", doc.congregation);
  add(page.body, "p", `Semana de ${doc.monday.split("-").reverse().join("/")}`);
  for (const meeting of doc.meetings) {
    add(page.body, "h2", meeting.title);
    add(page.body, "p", meeting.when);
    for (const part of meeting.parts) {
      const article = add(page.body, "article", "");
      add(article, "strong", `${part.section} · ${part.title}`);
      add(article, "p", `${part.name} — ${part.status}`);
    }
  }
  add(
    page.body,
    "p",
    `Cópia gerada: ${doc.generatedAt}. Consulte o aplicativo para atualizações.`,
  );
  popup.focus();
}
export async function downloadWeeklyPng(doc: WeeklyDocument) {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  let ctx = canvas.getContext("2d");
  if (!ctx)
    throw new Error(
      "Este navegador não conseguiu criar a imagem. Use a exportação PDF.",
    );
  ctx.font = "28px Arial";
  const measure = (v: string) => ctx!.measureText(v).width;
  const lines = documentLines(doc).flatMap((line) =>
    wrapText(line, measure, 1080),
  );
  canvas.height = lines.length * 42 + 120;
  if (canvas.height > 16000)
    throw new Error(
      "O quadro é grande demais para uma imagem. Use a exportação PDF, que divide em páginas.",
    );
  ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#282c2e";
  ctx.font = "28px Arial";
  lines.forEach((line, index) => ctx!.fillText(line, 60, 70 + index * 42));
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) =>
        value
          ? resolve(value)
          : reject(
              new Error(
                "Não foi possível criar a imagem. Tente exportar em PDF.",
              ),
            ),
      "image/png",
    ),
  );
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = `quadro-${doc.monday}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
