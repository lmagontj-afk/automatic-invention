import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    try {
      const client = await createClient();
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(new URL("/", request.url));
    } catch {
      /* Exibir apenas mensagem genérica, sem detalhes da sessão. */
    }
  }
  return new Response(
    "O link de acesso expirou ou já foi usado. Volte ao início e entre com sua senha, ou solicite outro acesso ao administrador.",
    {
      status: 400,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}
