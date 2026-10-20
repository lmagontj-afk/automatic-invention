import { expect, test } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir demonstração" }).click();
});
test("sugere e salva duas reuniões sem duplicar pessoas", async ({ page }) => {
  await expect(
    page.getByRole("heading", { name: "Designações", exact: true }),
  ).toBeVisible();
  for (let index = 0; index < 2; index++) {
    await page
      .getByRole("button", { name: "Sugerir designados" })
      .nth(index)
      .click();
    const selected = await page
      .locator("select")
      .filter({ has: page.locator('option[value=""]') })
      .evaluateAll((elements) =>
        elements.map((e) => (e as HTMLSelectElement).value),
      );
    expect(selected.filter(Boolean).length).toBeGreaterThan(0);
    await page
      .getByRole("button", { name: "Salvar reunião" })
      .nth(index)
      .click();
    await expect(page.getByRole("status").first()).toContainText(
      "Designações salvas",
    );
  }
  await expect(page.getByText("Aguardando confirmação")).toHaveCount(17);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test("mostra conflito ao escolher a mesma pessoa duas vezes", async ({
  page,
}) => {
  const selects = page.getByLabel(/Designado para/);
  await selects.nth(0).selectOption("person-0");
  await selects.nth(1).selectOption("person-0");
  await expect(
    page.getByRole("alert", { name: "Conflitos nesta reunião" }),
  ).toContainText("duas vezes");
  await expect(
    page.getByRole("button", { name: "Salvar reunião" }).first(),
  ).toBeDisabled();
});
test("cadastro, busca, histórico e tema funcionam no celular", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Irmãos", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar pessoa" }).click();
  await page
    .getByRole("textbox", { name: "Nome", exact: true })
    .fill("Pessoa Fictícia Nova");
  await page.getByRole("button", { name: "Salvar cadastro" }).click();
  await expect(page.getByRole("status").first()).toContainText(
    "Cadastro salvo",
  );
  await page.getByLabel("Buscar irmãos").fill("Fictícia Nova");
  await expect(
    page.getByRole("heading", { name: "Pessoa Fictícia Nova" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Histórico", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Histórico", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await page.getByRole("button", { name: "Alternar tema" }).click();
  await expect(page.getByRole("status").last()).toContainText("Tema");
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Abrir demonstração" }),
  ).toBeVisible();
});

test("mudança de regra limpa uma pessoa inelegível mesmo com trava", async ({
  page,
}) => {
  await page
    .getByRole("combobox", {
      name: "Designado para Demonstração · titular",
      exact: true,
    })
    .selectOption("person-12");
  const article = page.locator("article").filter({
    has: page.getByRole("heading", { name: /Demonstração · titular/ }),
  });
  await article.getByRole("checkbox", { name: "Travar parte" }).check();
  await page.getByRole("button", { name: "Salvar reunião" }).first().click();
  await page
    .getByRole("combobox", {
      name: "Regra para Demonstração · titular",
      exact: true,
    })
    .selectOption("somente_anciaos");
  await expect(
    page.getByRole("combobox", {
      name: "Designado para Demonstração · titular",
      exact: true,
    }),
  ).toHaveValue("");
  await expect(page.getByRole("status").first()).toContainText("removidos");
});

test("irmão confirma e recusa; designador vê substitutos", async ({ page }) => {
  await page.getByRole("button", { name: "Próxima semana" }).click();
  await page.getByRole("button", { name: "Criar reuniões da semana" }).click();
  await page
    .getByRole("combobox", { name: "Designado para Presidente", exact: true })
    .first()
    .selectOption("person-0");
  await page.getByRole("button", { name: "Salvar reunião" }).first().click();
  await page.getByRole("button", { name: "Simular perfil de irmão" }).click();
  await expect(
    page.getByRole("button", { name: "Sugerir designados" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Confirmar participação" }).click();
  await expect(page.getByText("Confirmada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Não poderei participar" }).click();
  await expect(page.getByText("Recusada", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Voltar à administração" }).click();
  await expect(
    page.getByText("Caio Exemplo recusou esta parte."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Sugerido:/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Salvar reunião" }).first().click();
  await expect(page.getByText("Caio Exemplo recusou esta parte.")).toHaveCount(
    0,
  );
});

test("exporta PNG e abre quadro de impressão sem telefones", async ({
  page,
}) => {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar imagem" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^quadro-.*\.png$/);
  const path = await file.path();
  const { readFileSync } = await import("node:fs");
  const bytes = readFileSync(path!);
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
  expect(bytes.length).toBeGreaterThan(1000);
  const pending = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Exportar PDF" }).click();
  const popup = await pending;
  await expect(
    popup.getByRole("heading", { name: "Quadro semanal", exact: true }),
  ).toBeVisible();
  await expect(
    popup.getByRole("button", { name: "Salvar como PDF / imprimir" }),
  ).toBeVisible();
  expect(await popup.locator("body").innerText()).not.toContain("WhatsApp");
  await popup.close();
});
test("consulta offline funciona após perder a rede e permite apagar a cópia", async ({
  page,
  context,
}) => {
  await page.getByText("Consultar sem internet", { exact: true }).click();
  await page
    .getByRole("checkbox", { name: /Este dispositivo é de confiança/ })
    .check();
  await page.getByRole("button", { name: "Salvar semana offline" }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Semana salva para consulta offline" }),
  ).toBeVisible();
  const raw = await page.evaluate(() =>
    localStorage.getItem("quadro-offline-v1"),
  );
  expect(raw).not.toContain("whatsapp");
  await context.setOffline(true);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Quadro salvo", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/somente leitura/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Salvar reunião" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Apagar cópia deste dispositivo" })
    .click();
  await expect(page.getByRole("status")).toContainText("apagada");
  await context.setOffline(false);
});
test("sair apaga a cópia offline e uma cópia expirada não exibe nomes", async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.setItem(
      "quadro-offline-v1",
      JSON.stringify({
        version: 1,
        userId: "demo-user",
        congregationId: "demo",
        role: "administrador",
        createdAt: Date.now() - 10000,
        expiresAt: Date.now() - 1,
        document: { congregation: "Nome que não deve aparecer", meetings: [] },
      }),
    ),
  );
  await page.goto("/offline.html");
  await expect(page.getByText(/A cópia expirou/)).toBeVisible();
  await expect(page.getByText("Nome que não deve aparecer")).toHaveCount(0);
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir demonstração" }).click();
  await page.evaluate(() =>
    localStorage.setItem("quadro-offline-v1", "marcador"),
  );
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("quadro-offline-v1")),
  ).toBeNull();
});
