import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config";
export async function createClient() {
  const { url, key } = supabaseConfig();
  const store = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        // Server Components não podem escrever cookies. Route handlers/actions podem.
        try { items.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* A renovação da sessão será tratada na camada de autenticação (etapa 4). */ }
      },
    },
  });
}
