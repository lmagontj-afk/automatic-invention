// Actual PostgreSQL policies, not mocked application-side filters.
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
const name = `quadro-rls-${process.pid}`;
const image = "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";
function docker(args, input, quiet = false) {
  const r = spawnSync("docker", args, { input, encoding: "utf8", timeout: 120_000 });
  if (r.error || r.status !== 0) throw new Error(r.error?.message ?? r.stderr ?? r.stdout);
  if (!quiet && r.stdout.trim()) process.stdout.write(r.stdout);
  if (!quiet && r.stderr) process.stdout.write(r.stderr);
  return r.stdout;
}
function sql(input) {
  // SQL assertions return void; show named assertions instead of blank result rows.
  const r = spawnSync("docker", ["exec", "-i", name, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A"], { input, encoding: "utf8", timeout: 30_000 });
  if (r.error || r.status !== 0) throw new Error(r.error?.message ?? r.stderr);
  if (r.stderr) process.stdout.write(r.stderr);
}
try {
  // Local throwaway container, no exposed ports, no production credentials.
  docker(["run", "--rm", "-d", "--name", name, "--network", "none", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", image], undefined, true);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    const r = spawnSync("docker", ["exec", name, "pg_isready", "-U", "postgres"], { encoding: "utf8" });
    const logs = spawnSync("docker", ["logs", name], { encoding: "utf8" });
    if (r.status === 0 && logs.stdout.includes("PostgreSQL init process complete")) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("PostgreSQL não iniciou; confira o Docker e execute npm run test:rls novamente.");
  sql(readFileSync("supabase/tests/bootstrap.sql", "utf8"));
  for (const file of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) sql(readFileSync(`supabase/migrations/${file}`, "utf8"));
  for (const file of ["rls.sql", "workflows.sql"]) sql(readFileSync(`supabase/tests/${file}`, "utf8"));
  console.log("RLS: todos os cenários e invariantes passaram no PostgreSQL 17.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  spawnSync("docker", ["rm", "-f", name], { stdio: "ignore" });
}
