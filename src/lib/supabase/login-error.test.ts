import { describe, expect, it } from "vitest";
import { loginError } from "./login-error";
describe("diagnóstico de login", () => {
  it("distingue credenciais incorretas de chave inválida", () => {
    expect(loginError({ code: "invalid_credentials", status: 400 })).toContain("E-mail ou senha incorretos");
    expect(loginError({ status: 401, message: "Invalid API key" })).toContain("chave pública");
  });
  it("indica confirmação, limite e conexão", () => {
    expect(loginError({ code: "email_not_confirmed" })).toContain("confirmado");
    expect(loginError({ status: 429 })).toContain("Aguarde");
    expect(loginError(new TypeError("Failed to fetch"))).toContain("conectar ao Supabase");
    expect(loginError({ name: "AuthRetryableFetchError" })).toContain("conectar ao Supabase");
  });
  it("expõe apenas código seguro e status, sem mensagens ou dados do provedor", () => {
    const result = loginError({ code: "unexpected_failure", status: 500, message: "senha e token privados" });
    expect(result).toContain("unexpected_failure");
    expect(result).toContain("HTTP 500");
    expect(result).not.toContain("privados");
    expect(loginError({ code: "secret@email.test" })).not.toContain("secret@");
    expect(loginError(null)).toContain("Auth logs");
  });
});
