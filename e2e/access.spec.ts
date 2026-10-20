import { expect, test, type Route } from "@playwright/test";
const userId = "00000000-0000-4000-8000-000000000001",
  a = "00000000-0000-4000-8000-000000000002",
  b = "00000000-0000-4000-8000-000000000003";
test("resposta atrasada não restaura a congregação anterior", async ({
  page,
}) => {
  let release!: () => void,
    started!: () => void,
    delayed = false;
  let profileRole = "administrador";
  const pause = new Promise<void>((resolve) => (release = resolve)),
    intercepted = new Promise<void>((resolve) => (started = resolve));
  await page.route("http://127.0.0.1:54321/**", async (route: Route) => {
    const req = route.request(),
      url = new URL(req.url());
    const headers = {
      "Access-Control-Allow-Origin": "http://127.0.0.1:3100",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Content-Type": "application/json",
    };
    if (req.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const user = {
      id: userId,
      email: "caio@example.test",
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    };
    if (url.pathname === "/auth/v1/token") {
      const encode = (o: unknown) =>
        Buffer.from(JSON.stringify(o)).toString("base64url");
      const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, aud: "authenticated", role: "authenticated" })}.fictitious`;
      await route.fulfill({
        headers,
        json: {
          access_token: token,
          refresh_token: "fictitious-refresh-token",
          expires_in: 3600,
          token_type: "bearer",
          user,
        },
      });
      return;
    }
    if (url.pathname === "/auth/v1/user") {
      await route.fulfill({ headers, json: user });
      return;
    }
    const table = url.pathname.split("/").at(-1),
      cid =
        url.searchParams.get("congregation_id")?.replace("eq.", "") ??
        url.searchParams.get("id")?.replace("eq.", "") ??
        a;
    const bindings = [a, b].map((id, i) => ({
      user_id: userId,
      congregation_id: id,
      member_id: `00000000-0000-4000-8000-00000000001${i}`,
      role: profileRole,
    }));
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (table === "members" && cid === a && offset === 0 && delayed) {
      delayed = false;
      started();
      await pause;
    }
    let rows: unknown[] = [];
    if (table === "congregation_memberships")
      rows = url.searchParams.has("congregation_id")
        ? bindings.filter((m) => m.congregation_id === cid)
        : bindings;
    if (table === "congregations")
      rows = [
        {
          id: cid,
          name: cid === a ? "Horizonte Fictícia" : "Jardim Fictícia",
          timezone: "America/Sao_Paulo",
        },
      ];
    if (table === "member_phones")
      rows = [
        {
          congregation_id: cid,
          member_id: bindings.find((m) => m.congregation_id === cid)!.member_id,
          whatsapp: "5511000000000",
        },
      ];
    if (table === "members")
      rows = [
        {
          id: bindings.find((m) => m.congregation_id === cid)!.member_id,
          name: "Caio Exemplo",
          category: "anciao",
          active: true,
          is_visitor: false,
        },
      ];
    const single = req.headers().accept?.includes("vnd.pgrst.object");
    await route.fulfill({
      headers,
      json: single ? (rows[0] ?? null) : offset ? [] : rows,
    });
  });
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill("caio@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("fictitious-password");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(
    page.getByText("Horizonte Fictícia", { exact: true }),
  ).toBeVisible();
  delayed = true;
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await intercepted;
  await page
    .getByRole("combobox", { name: "Congregação", exact: true })
    .selectOption(b);
  await expect(
    page.getByText("Jardim Fictícia", { exact: true }),
  ).toBeVisible();
  const finished = page.waitForResponse((r) => {
    const url = new URL(r.url());
    return (
      url.pathname === "/rest/v1/members" &&
      url.searchParams.get("congregation_id") === `eq.${a}` &&
      url.searchParams.get("offset") === "1"
    );
  });
  release();
  await (await finished).finished();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(
    page.getByText("Jardim Fictícia", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Horizonte Fictícia", { exact: true }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Irmãos", exact: true }).click();
  await page
    .getByRole("button", { name: "Editar Caio Exemplo", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", {
      name: "WhatsApp com país e DDD (opcional)",
      exact: true,
    }),
  ).toHaveValue("5511000000000");
  profileRole = "irmao";
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Meu cadastro", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Salvar cadastro", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("WhatsApp: +5511000000000", { exact: true }),
  ).toHaveCount(0);
});
