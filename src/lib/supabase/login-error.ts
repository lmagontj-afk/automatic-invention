/** Describe authentication failures without exposing provider payloads or credentials. */
export function loginError(error: unknown): string {
  const detail = error && typeof error === "object"
    ? error as { code?: string; status?: number; message?: string; name?: string }
    : {};
  if (detail.code === "invalid_credentials")
    return "E-mail ou senha incorretos. Use a senha da conta criada em Authentication → Users no Supabase, não a senha do banco de dados.";
  if (detail.code === "email_not_confirmed")
    return "O e-mail ainda não foi confirmado. Confirme a conta em Authentication → Users no Supabase antes de entrar.";
  if (detail.status === 429 || detail.code === "over_request_rate_limit")
    return "Muitas tentativas de acesso. Aguarde alguns minutos antes de tentar novamente.";
  if (detail.status === 401 || /invalid api key|invalid apikey|no api key/i.test(detail.message ?? ""))
    return "A chave pública de conexão foi rejeitada. Configure NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY com a chave Publishable do mesmo projeto da URL e publique novamente na Vercel.";
  if (detail.code === "email_provider_disabled" || detail.code === "signup_disabled")
    return "O acesso por e-mail está desabilitado. Revise o provedor Email em Authentication no Supabase.";
  if (detail.name === "AuthRetryableFetchError" || error instanceof TypeError || detail.status === 0)
    return "Não foi possível conectar ao Supabase. Confira a internet, se o projeto está ativo e se NEXT_PUBLIC_SUPABASE_URL corresponde ao projeto correto na Vercel.";
  const code = typeof detail.code === "string" && /^[a-z_]{1,60}$/.test(detail.code)
    ? ` Código: ${detail.code}.` : "";
  const status = Number.isInteger(detail.status) && detail.status! >= 400 && detail.status! <= 599
    ? ` HTTP ${detail.status}.` : "";
  return `Não foi possível concluir o login.${code}${status} Peça ao administrador para verificar os Auth logs do Supabase nesse horário.`;
}
