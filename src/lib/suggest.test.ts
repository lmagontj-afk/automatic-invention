import { describe, expect, it } from "vitest";
import { categories, changePartEligibility, eligibilityRules, isEligible, rankCandidates, suggest, type Assignment, type Category, type EligibilityRule, type HistoryEntry, type Member, type Part, type SuggestInput } from "./suggest";

const member = (id: string, category: Category = "irmao_batizado", overrides: Partial<Member> = {}): Member => ({ id, congregationId: "c", name: `${id} Exemplo`, category, active: true, unavailability: [], ...overrides });
const part = (id: string, eligibility: EligibilityRule = "qualquer_pessoa", overrides: Partial<Part> = {}): Part => ({ id, congregationId: "c", meetingId: "meeting", eligibility, ...overrides });
const input = (overrides: Partial<SuggestInput> = {}): SuggestInput => ({ congregationId: "c", meeting: { id: "meeting", congregationId: "c", date: "2026-10-21" }, members: [], parts: [], existing: [], history: [], ...overrides });
const history = (memberId: string, count: number, date = "2026-09-01"): HistoryEntry[] => Array.from({ length: count }, (_, i) => ({ assignmentId: `${memberId}-${i}`, congregationId: "c", meetingId: `past-${i}`, memberId, date, status: "confirmada" }));
function assignments(data: SuggestInput): Assignment[] {
  const result = suggest(data);
  expect(result.status).not.toBe("blocked");
  if (result.status === "blocked") throw new Error("Unexpected blocked result");
  return result.assignments;
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") { Object.freeze(value); Object.values(value).forEach(v => deepFreeze(v)); }
  return value;
}

describe("matriz de elegibilidade", () => {
  const expected = [[true, false, false, false], [true, true, false, false], [true, true, true, false], [true, true, true, true]];
  categories.forEach((category, i) => {
    eligibilityRules.forEach((rule, j) => it(`${category} / ${rule}`, () => expect(isEligible(category, rule)).toBe(expected[i][j])));
  });
  it("falha fechado para valores externos desconhecidos", () => {
    expect(isEligible("desconhecida" as Category, "qualquer_pessoa")).toBe(false);
    expect(isEligible("anciao", "desconhecida" as EligibilityRule)).toBe(false);
  });
});

describe("sugestão de designados", () => {
  it("preenche as partes elegíveis sem repetir pessoas, inclusive titular e ajudante", () => {
    const data = input({ members: [member("lia", "irma"), member("caio", "anciao"), member("davi", "servo_ministerial"), member("luan")], parts: [part("titular"), part("ajudante"), part("dirigente", "somente_anciaos"), part("leitor", "anciaos_e_servos")] });
    const result = suggest(data);
    expect(result.status).toBe("complete");
    const selected = assignments(data);
    expect(selected).toHaveLength(4);
    expect(new Set(selected.map(a => a.memberId)).size).toBe(4);
    for (const a of selected) expect(isEligible(data.members.find(m => m.id === a.memberId)!.category, data.parts.find(p => p.id === a.partId)!.eligibility)).toBe(true);
  });
  it("reorganiza uma escolha anterior para não gastar o único ancião na parte aberta", () => {
    const data = input({ members: [member("a-elder", "anciao"), member("b-baptized")], parts: [part("a-open"), part("b-elder", "somente_anciaos")], history: history("b-baptized", 10) });
    expect(assignments(data)).toEqual([{ partId: "a-open", memberId: "b-baptized", locked: false }, { partId: "b-elder", memberId: "a-elder", locked: false }]);
  });
  it("não relaxa elegibilidade quando faltam candidatos", () => {
    const result = suggest(input({ members: [member("lia", "irma")], parts: [part("elder", "somente_anciaos")] }));
    expect(result).toEqual({ status: "partial", assignments: [{ partId: "elder", memberId: null, locked: false }], unfilled: [{ partId: "elder", reason: "no_eligible_member" }] });
  });
  it("explica falta de pessoas distintas em vez de duplicar", () => {
    const result = suggest(input({ members: [member("caio", "anciao")], parts: [part("p1"), part("p2")] }));
    expect(result.status).toBe("partial");
    if (result.status === "blocked") throw new Error();
    expect(result.assignments.filter(a => a.memberId !== null)).toHaveLength(1);
    expect(result.unfilled[0].reason).toBe("not_enough_distinct_members");
  });
  it.each(["2026-10-20", "2026-10-21", "2026-10-22"])("respeita intervalo inclusivo na data %s", date => {
    const data = input({ meeting: { id: "meeting", congregationId: "c", date }, members: [member("away", "anciao", { unavailability: [{ startsOn: "2026-10-20", endsOn: "2026-10-22" }] }), member("free")], parts: [part("p")] });
    expect(assignments(data)[0].memberId).toBe("free");
  });
  it("permite a pessoa no dia seguinte e interpreta datas civis sem conversão UTC", () => {
    const data = input({ members: [member("free", "anciao", { unavailability: [{ startsOn: "2026-10-19", endsOn: "2026-10-20" }] })], parts: [part("p")] });
    expect(assignments(data)[0].memberId).toBe("free");
  });
  it("exclui inativos e pessoas de outra congregação", () => {
    const data = input({ members: [member("inactive", "anciao", { active: false }), member("outsider", "anciao", { congregationId: "other" }), member("free")], parts: [part("p")] });
    expect(assignments(data)[0].memberId).toBe("free");
  });
  it("aceita visitante apenas na parte explicitamente permitida", () => {
    const visitor = member("visitor", "anciao", { isVisitor: true });
    expect(assignments(input({ members: [visitor], parts: [part("p")] }))[0].memberId).toBeNull();
    expect(assignments(input({ members: [visitor], parts: [part("p", "somente_anciaos", { allowsVisitor: true })] }))[0].memberId).toBe("visitor");
  });
  it("ainda exige a categoria correta de um visitante", () => {
    expect(assignments(input({ members: [member("visitor", "irmao_batizado", { isVisitor: true })], parts: [part("p", "somente_anciaos", { allowsVisitor: true })] }))[0].memberId).toBeNull();
  });
  it("uma pessoa pode participar de outra reunião sem ser duplicada nesta", () => {
    expect(assignments(input({ members: [member("m")], parts: [part("p")], history: [{ ...history("m", 1)[0], meetingId: "other-meeting", date: "2026-10-21" }] }))[0].memberId).toBe("m");
  });
  it("retorna quadro vazio completo quando não há partes", () => {
    expect(suggest(input())).toEqual({ status: "complete", assignments: [], unfilled: [] });
  });
});

describe("travas manuais", () => {
  it("preserva a trava válida mesmo se o histórico favorece outro candidato", () => {
    const data = input({ members: [member("busy"), member("free")], parts: [part("p1"), part("p2")], existing: [{ partId: "p1", memberId: "busy", locked: true }], history: history("busy", 10) });
    expect(assignments(data)).toEqual([{ partId: "p1", memberId: "busy", locked: true }, { partId: "p2", memberId: "free", locked: false }]);
  });
  it("preserva uma parte intencionalmente vazia e travada", () => {
    const result = suggest(input({ members: [member("m")], parts: [part("p")], existing: [{ partId: "p", memberId: null, locked: true }] }));
    expect(result).toEqual({ status: "partial", assignments: [{ partId: "p", memberId: null, locked: true }], unfilled: [{ partId: "p", reason: "manually_locked" }] });
  });
  it.each([
    [member("m", "irma"), "somente_anciaos", "ineligible"],
    [member("m", "anciao", { active: false }), "qualquer_pessoa", "inactive"],
    [member("m", "anciao", { congregationId: "other" }), "qualquer_pessoa", "member_missing"],
    [member("m", "anciao", { unavailability: [{ startsOn: "2026-10-21", endsOn: "2026-10-21" }] }), "qualquer_pessoa", "unavailable"],
  ] as const)("bloqueia propostas para uma trava inválida: %s, %s", (m, rule, code) => {
    const result = suggest(input({ members: [m, member("free", "anciao")], parts: [part("p", rule)], existing: [{ partId: "p", memberId: "m", locked: true }] }));
    expect(result.status).toBe("blocked");
    expect(result).not.toHaveProperty("assignments");
    if (result.status !== "blocked") throw new Error();
    expect(result.conflicts[0].code).toBe(code);
    expect(result.conflicts[0].message.length).toBeGreaterThan(20);
  });
  it("bloqueia duas travas na mesma pessoa", () => {
    const data = input({ members: [member("m"), member("free")], parts: [part("p1"), part("p2")], existing: [{ partId: "p1", memberId: "m", locked: true }, { partId: "p2", memberId: "m", locked: true }] });
    const result = suggest(data);
    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") throw new Error();
    expect(result.conflicts[0].code).toBe("duplicate_locked_member");
  });
  it("regenera designações destravadas, inclusive inválidas", () => {
    const data = input({ members: [member("m", "anciao")], parts: [part("p", "somente_anciaos")], existing: [{ partId: "p", memberId: "missing", locked: false }] });
    expect(assignments(data)[0].memberId).toBe("m");
  });
});

describe("equilíbrio e ranking", () => {
  it("prefere quem participou menos no histórico confirmado", () => {
    const data = input({ members: [member("a-busy"), member("b-new"), member("c-once")], parts: [part("p1"), part("p2")], history: [...history("a-busy", 5), ...history("c-once", 1)] });
    expect(new Set(assignments(data).map(a => a.memberId))).toEqual(new Set(["b-new", "c-once"]));
  });
  it("desempata pela participação mais antiga e depois por ID", () => {
    const data = input({ members: [member("a-recent"), member("b-old"), member("c-old")], parts: [part("p")], history: [...history("a-recent", 1, "2026-10-01"), ...history("b-old", 1, "2026-09-01"), ...history("c-old", 1, "2026-09-01")] });
    expect(assignments(data)[0].memberId).toBe("b-old");
    expect(rankCandidates(data, "p").map(c => c.memberId)).toEqual(["b-old", "c-old", "a-recent"]);
  });
  it("ignora recusas, pendentes, futuro, mesma reunião e outra congregação", () => {
    const entries: HistoryEntry[] = [
      { ...history("a", 1)[0], assignmentId: "declined", status: "recusada" },
      { ...history("a", 1)[0], assignmentId: "pending", status: "pendente" },
      { ...history("a", 1)[0], assignmentId: "future", date: "2026-12-01" },
      { ...history("a", 1)[0], assignmentId: "same-date", date: "2026-10-21" },
      { ...history("a", 1)[0], assignmentId: "current", meetingId: "meeting" },
      { ...history("a", 1)[0], assignmentId: "foreign", congregationId: "other" },
    ];
    const data = input({ members: [member("a"), member("b")], parts: [part("p")], history: [...entries, ...history("b", 1)] });
    expect(rankCandidates(data, "p")[0]).toEqual({ memberId: "a", frequency: 0, lastAssignedOn: null });
    expect(assignments(data)[0].memberId).toBe("a");
  });
  it("não conta duas vezes a mesma designação", () => {
    const entry = history("a", 1)[0];
    const data = input({ members: [member("a")], parts: [part("p")], history: [entry, { ...entry }] });
    expect(rankCandidates(data, "p")[0].frequency).toBe(1);
  });
  it("ranking exclui pessoas já ocupadas em outros slots e mantém a pessoa do slot alvo", () => {
    const data = input({ members: [member("a"), member("b"), member("c", "irma"), member("inactive", "anciao", { active: false })], parts: [part("p1", "irmaos_batizados"), part("p2")], existing: [{ partId: "p1", memberId: "a", locked: false }, { partId: "p2", memberId: "b", locked: false }] });
    expect(rankCandidates(data, "p1").map(c => c.memberId)).toEqual(["a"]);
  });
});

describe("edição de regra e segurança dos dados de entrada", () => {
  it("remove ocupante que ficou inelegível, inclusive travado, sem mudar outras partes", () => {
    const data = input({ members: [member("a"), member("b", "anciao")], parts: [part("p1"), part("p2")], existing: [{ partId: "p1", memberId: "a", locked: true }, { partId: "p2", memberId: "b", locked: true }] });
    const edited = changePartEligibility(data, "p1", "somente_anciaos");
    expect(edited.removed).toEqual([data.existing[0]]);
    expect(edited.assignments).toEqual([{ partId: "p1", memberId: null, locked: false }, data.existing[1]]);
    expect(edited.parts[0].eligibility).toBe("somente_anciaos");
    expect(data.parts[0].eligibility).toBe("qualquer_pessoa");
  });
  it("preserva designado e trava quando continua elegível", () => {
    const data = input({ members: [member("m", "anciao")], parts: [part("p")], existing: [{ partId: "p", memberId: "m", locked: true }] });
    expect(changePartEligibility(data, "p", "somente_anciaos").assignments).toEqual(data.existing);
    expect(changePartEligibility(data, "p", "somente_anciaos").removed).toEqual([]);
  });
  it.each(["2026-02-29", "2026-13-01", "21/10/2026", "2026-1-01", "0000-01-01"])("rejeita data inválida %s", date => {
    expect(() => suggest(input({ meeting: { id: "meeting", congregationId: "c", date } }))).toThrow("Data inválida");
  });
  it("aceita ano bissexto real", () => {
    expect(suggest(input({ meeting: { id: "meeting", congregationId: "c", date: "2028-02-29" } })).status).toBe("complete");
  });
  it("rejeita intervalo invertido", () => {
    expect(() => suggest(input({ members: [member("m", "anciao", { unavailability: [{ startsOn: "2026-10-22", endsOn: "2026-10-20" }] })] }))).toThrow("invertido");
  });
  it("rejeita IDs duplicados, inclusive designações repetidas para a mesma parte", () => {
    expect(() => suggest(input({ members: [member("m"), member("m")] }))).toThrow("duplicados");
    expect(() => suggest(input({ parts: [part("p"), part("p")] }))).toThrow("duplicados");
    expect(() => suggest(input({ parts: [part("p")], existing: [{ partId: "p", memberId: null, locked: false }, { partId: "p", memberId: null, locked: false }] }))).toThrow("duplicados");
  });
  it("rejeita reunião e partes de outro escopo", () => {
    expect(() => suggest(input({ meeting: { id: "meeting", congregationId: "other", date: "2026-10-21" } }))).toThrow("congregação");
    expect(() => suggest(input({ parts: [part("p", "qualquer_pessoa", { congregationId: "other" })] }))).toThrow("congregação");
    expect(() => suggest(input({ parts: [part("p", "qualquer_pessoa", { meetingId: "other" })] }))).toThrow("reunião");
  });
  it("rejeita designação sem parte e histórico com versões conflitantes", () => {
    expect(() => suggest(input({ existing: [{ partId: "missing", memberId: null, locked: false }] }))).toThrow("não existe");
    const entry = history("a", 1)[0];
    expect(() => suggest(input({ history: [entry, { ...entry, status: "recusada" }] }))).toThrow("conflitantes");
  });
  it("rejeita regra/categoria desconhecida e alvo inexistente", () => {
    expect(() => suggest(input({ parts: [part("p", "invalid" as EligibilityRule)] }))).toThrow("desconhecida");
    expect(() => suggest(input({ members: [member("m", "invalid" as Category)] }))).toThrow("desconhecida");
    expect(() => rankCandidates(input(), "missing")).toThrow("não encontrada");
    expect(() => changePartEligibility(input(), "missing", "somente_anciaos")).toThrow("não encontrada");
  });
  it("não altera os dados de entrada, mesmo com objetos congelados", () => {
    const data = deepFreeze(input({ members: [member("a"), member("b", "anciao")], parts: [part("p1"), part("p2", "somente_anciaos")], existing: [{ partId: "p1", memberId: "a", locked: true }], history: history("b", 2) }));
    const before = JSON.stringify(data);
    suggest(data); rankCandidates(data, "p2"); changePartEligibility(data, "p1", "somente_anciaos");
    expect(JSON.stringify(data)).toBe(before);
  });
  it("é determinístico mesmo reordenando as entradas", () => {
    const data = input({ members: [member("c", "anciao"), member("a"), member("b", "servo_ministerial")], parts: [part("z"), part("a", "anciaos_e_servos")], history: [...history("a", 1), ...history("c", 1)] });
    expect(suggest(data)).toEqual(suggest({ ...data, members: [...data.members].reverse(), parts: [...data.parts].reverse(), history: [...data.history].reverse() }));
  });
});

/** Independent exhaustive oracle for small cases: maximize filled slots first,
 * then minimize total historical frequency. It does NOT reuse the flow code.
 */
function bruteForce(data: SuggestInput): { filled: number; cost: number } {
  let best = { filled: -1, cost: Infinity };
  const locked = new Map(data.existing.filter(a => a.locked).map(a => [a.partId, a]));
  const used = new Set([...locked.values()].flatMap(a => a.memberId === null ? [] : [a.memberId]));
  function walk(index: number, filled: number, cost: number) {
    if (index === data.parts.length) {
      if (filled > best.filled || (filled === best.filled && cost < best.cost)) best = { filled, cost };
      return;
    }
    const fixed = locked.get(data.parts[index].id);
    if (fixed) {
      walk(index + 1, filled + (fixed.memberId === null ? 0 : 1), cost + (fixed.memberId === null ? 0 : data.history.filter(h => h.memberId === fixed.memberId).length));
      return;
    }
    walk(index + 1, filled, cost);
    for (const m of data.members) {
      const p = data.parts[index];
      if (used.has(m.id) || !m.active || (m.isVisitor && !p.allowsVisitor) || !isEligible(m.category, p.eligibility) || m.unavailability.some(r => r.startsOn <= data.meeting.date && data.meeting.date <= r.endsOn)) continue;
      used.add(m.id);
      walk(index + 1, filled + 1, cost + data.history.filter(h => h.memberId === m.id).length);
      used.delete(m.id);
    }
  }
  walk(0, 0, 0);
  return best;
}
describe("revisão do algoritmo contra busca exaustiva", () => {
  it("maximiza cobertura e minimiza frequência em 250 cenários reproduzíveis", () => {
    let seed = 71293;
    const next = (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return (seed >>> 8) % n; };
    for (let scenario = 0; scenario < 250; scenario++) {
      const members = Array.from({ length: next(6) }, (_, i) => member(`m${i}`, categories[next(4)], { isVisitor: next(4) === 0, active: next(8) !== 0, unavailability: next(6) === 0 ? [{ startsOn: "2026-10-21", endsOn: "2026-10-21" }] : [] }));
      const data = input({ members, parts: Array.from({ length: next(5) }, (_, i) => part(`p${i}`, eligibilityRules[next(4)], { allowsVisitor: next(2) === 0 })), history: members.flatMap(m => history(m.id, next(5))) });
      const actual = assignments(data);
      const chosen = actual.filter(a => a.memberId !== null);
      const cost = chosen.reduce((sum, a) => sum + data.history.filter(h => h.memberId === a.memberId).length, 0);
      expect({ filled: chosen.length, cost }, `cenário ${scenario}`).toEqual(bruteForce(data));
      expect(new Set(chosen.map(a => a.memberId)).size).toBe(chosen.length);
      for (const a of chosen) {
        const m = members.find(m => m.id === a.memberId)!;
        expect(isEligible(m.category, data.parts.find(p => p.id === a.partId)!.eligibility)).toBe(true);
      }
    }
  });
});

describe("revisão com restrições manuais", () => {
  it("explica quando uma trava válida ocupa o único candidato de outra parte", () => {
    const result = suggest(input({ members: [member("elder", "anciao")], parts: [part("open"), part("elder", "somente_anciaos")], existing: [{ partId: "open", memberId: "elder", locked: true }] }));
    expect(result.status).toBe("partial");
    if (result.status === "blocked") throw new Error();
    expect(result.unfilled).toEqual([{ partId: "elder", reason: "not_enough_distinct_members" }]);
    expect(result.assignments.find(a => a.partId === "open")?.locked).toBe(true);
  });
  it("confere 150 cenários com travas contra a busca exaustiva", () => {
    for (let i = 0; i < 150; i++) {
      const members = Array.from({ length: 1 + i % 5 }, (_, j) => member(`m${j}`, categories[(i + j) % 4], { isVisitor: (i + j) % 5 === 0 }));
      const parts = Array.from({ length: 1 + i % 4 }, (_, j) => part(`p${j}`, eligibilityRules[(Math.floor(i / 4) + j) % 4], { allowsVisitor: (i + j) % 2 === 0 }));
      const candidate = members.find(m => isEligible(m.category, parts[0].eligibility) && (!m.isVisitor || parts[0].allowsVisitor));
      const fixed: Assignment = { partId: "p0", memberId: i % 3 === 0 ? null : candidate?.id ?? null, locked: true };
      const data = input({ members, parts, existing: [fixed], history: members.flatMap((m, j) => history(m.id, (i + j) % 4)) });
      const selected = assignments(data).filter(a => a.memberId !== null);
      const cost = selected.reduce((sum, a) => sum + data.history.filter(h => h.memberId === a.memberId).length, 0);
      expect({ filled: selected.length, cost }, `trava, cenário ${i}`).toEqual(bruteForce(data));
      expect(assignments(data).find(a => a.partId === fixed.partId)).toEqual(fixed);
      expect(new Set(selected.map(a => a.memberId)).size).toBe(selected.length);
    }
  });
  it("atende uma reunião maior com mistura de categorias e partes", () => {
    const members = Array.from({ length: 80 }, (_, i) => member(`m${String(i).padStart(2, "0")}`, categories[i % 4]));
    const parts = Array.from({ length: 24 }, (_, i) => part(`p${i}`, eligibilityRules[i % 4]));
    const result = suggest(input({ members, parts, history: members.flatMap((m, i) => history(m.id, i % 7)) }));
    expect(result.status).toBe("complete");
    if (result.status === "blocked") throw new Error();
    expect(new Set(result.assignments.map(a => a.memberId)).size).toBe(24);
  });
});
