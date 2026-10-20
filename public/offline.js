/* Standalone viewer deliberately has no Supabase client, session or editing UI. */
(() => {
  const KEY = "quadro-offline-v1",
    TTL = 24 * 60 * 60 * 1000,
    root = document.getElementById("quadro"),
    status = document.getElementById("status");
  let expiryTimer;
  function text(parent, tag, value) {
    const node = document.createElement(tag);
    node.textContent = String(value);
    parent.append(node);
    return node;
  }
  function clear(message) {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* Storage may be blocked. */
    }
    clearTimeout(expiryTimer);
    root.replaceChildren();
    text(root, "p", message);
  }
  function render() {
    root.replaceChildren();
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) {
        text(
          root,
          "p",
          "Nenhuma semana salva. Conecte-se, entre na sua conta e use Salvar semana offline.",
        );
        return;
      }
      const s = JSON.parse(raw),
        now = Date.now();
      if (
        s.version !== 1 ||
        !Number.isFinite(s.createdAt) ||
        !Number.isFinite(s.expiresAt) ||
        s.createdAt > now ||
        s.expiresAt <= now ||
        s.expiresAt - s.createdAt <= 0 ||
        s.expiresAt - s.createdAt > TTL ||
        !Array.isArray(s.document?.meetings)
      ) {
        clear(
          "A cópia expirou ou não está disponível. Reconecte-se para salvar uma versão atualizada.",
        );
        return;
      }
      text(root, "h2", s.document.congregation);
      text(
        root,
        "p",
        `Semana de ${s.document.monday.split("-").reverse().join("/")}`,
      );
      text(
        root,
        "p",
        `Salva em ${s.document.generatedAt}. Expira em ${new Date(s.expiresAt).toLocaleString("pt-BR")}.`,
      );
      for (const meeting of s.document.meetings) {
        text(root, "h2", meeting.title);
        text(root, "p", meeting.when);
        for (const part of meeting.parts) {
          const article = text(root, "article", "");
          text(article, "strong", `${part.section} · ${part.title}`);
          text(article, "p", part.name);
          text(article, "p", part.status);
        }
      }
      expiryTimer = setTimeout(
        () =>
          clear(
            "A cópia expirou. Reconecte-se para salvar uma versão atualizada.",
          ),
        s.expiresAt - now,
      );
    } catch {
      clear(
        "Não foi possível ler a cópia salva. Reconecte-se e salve a semana novamente.",
      );
    }
  }
  document.getElementById("apagar").addEventListener("click", () => {
    clear("Nenhuma semana salva. Conecte-se para preparar uma nova cópia.");
    status.textContent = "Cópia offline apagada.";
  });
  window.addEventListener("storage", (event) => {
    if (event.key === KEY) {
      clearTimeout(expiryTimer);
      render();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      clearTimeout(expiryTimer);
      render();
    }
  });
  render();
})();
