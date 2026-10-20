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
    .getByRole("combobox", { name: "Designado para Demonstração · titular", exact: true })
    .selectOption("person-12");
  const article = page
    .locator("article")
    .filter({
      has: page.getByRole("heading", { name: /Demonstração · titular/ }),
    });
  await article.getByRole("checkbox", { name: "Travar parte" }).check();
  await page.getByRole("button", { name: "Salvar reunião" }).first().click();
  await page
    .getByRole("combobox", { name: "Regra para Demonstração · titular", exact: true })
    .selectOption("somente_anciaos");
  await expect(
    page.getByRole("combobox", { name: "Designado para Demonstração · titular", exact: true }),
  ).toHaveValue("");
  await expect(page.getByRole("status").first()).toContainText("removidos");
});
