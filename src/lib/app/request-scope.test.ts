import { describe, expect, it } from "vitest";
import { RequestScope } from "./request-scope";
describe("respostas de rede e mudança de contexto", () => {
  it("não aceita resposta atrasada após troca de conta/congregação", async () => {
    const scope = new RequestScope(),
      current = scope.begin();
    let release!: (v: string) => void;
    const request = new Promise<string>((resolve) => (release = resolve));
    const accepted: string[] = [];
    const pending = request.then((value) => {
      if (current()) accepted.push(value);
    });
    scope.invalidate();
    release("dados da congregação anterior");
    await pending;
    expect(accepted).toEqual([]);
  });
  it("a requisição mais recente vence mesmo na mesma congregação", () => {
    const scope = new RequestScope(),
      first = scope.begin(),
      second = scope.begin();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });
  it("consulta de vínculos pode capturar o contexto sem cancelar uma operação", () => {
    const scope = new RequestScope(),
      first = scope.begin(),
      same = scope.capture();
    expect(first()).toBe(true);
    expect(same()).toBe(true);
    scope.invalidate();
    expect(first()).toBe(false);
    expect(same()).toBe(false);
  });
});
