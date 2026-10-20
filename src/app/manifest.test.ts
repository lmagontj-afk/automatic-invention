import { expect, it } from "vitest";
import manifest from "./manifest";
it("publica um manifesto instalável em português", () => { const m = manifest(); expect(m.lang).toBe("pt-BR"); expect(m.display).toBe("standalone"); expect(m.start_url).toBe("/"); expect(m.icons?.map(i => i.sizes)).toEqual(["192x192", "512x512", "512x512"]); });
