import { describe, expect, it } from "vitest";
import { resolveTheme } from "./theme";
describe("preferência de tema", () => {
  it("respeita a escolha salva", () => { expect(resolveTheme("light", true)).toBe("light"); expect(resolveTheme("dark", false)).toBe("dark"); });
  it("usa o sistema quando não há escolha válida", () => { expect(resolveTheme(null, true)).toBe("dark"); expect(resolveTheme("invalid", false)).toBe("light"); });
});
