import { expect, test } from "@playwright/test";
test("login explica chave inválida, credenciais e confirmação sem ferramentas do navegador", async ({ page }) => {
  let response = { status: 401, body: { message: "Invalid API key" } as Record<string, string> };
  await page.route("http://127.0.0.1:54321/**", async route => {
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:3100",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "X-Supabase-Api-Version": "2024-01-01",
      "Access-Control-Expose-Headers": "X-Supabase-Api-Version",
    };
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    await route.fulfill({ status: response.status, headers, json: response.body });
  });
  await page.goto("/");
  await page.getByLabel("E-mail").fill("caio@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("senha-ficticia");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText(/A chave pública de conexão foi rejeitada/)).toBeVisible();
  response = { status: 400, body: { code: "invalid_credentials", msg: "Invalid login credentials" } };
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText(/E-mail ou senha incorretos/)).toBeVisible();
  response = { status: 400, body: { code: "email_not_confirmed", msg: "Email not confirmed" } };
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText(/O e-mail ainda não foi confirmado/)).toBeVisible();
});
