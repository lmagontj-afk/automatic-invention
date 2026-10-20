import { afterEach, describe, expect, it, vi } from "vitest";
import { supabaseConfig } from "./config";
afterEach(() => vi.unstubAllEnvs());
describe("configuração Supabase", () => {
  it("explica como resolver a configuração ausente", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", ""); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    expect(() => supabaseConfig()).toThrow(".env.local");
  });
  it("aceita URL e chave pública sem service role", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "public-test-key");
    expect(supabaseConfig()).toEqual({ url: "https://example.supabase.co", key: "public-test-key" });
  });
});
