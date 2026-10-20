/** Pure domain module: no database, clock, random values, or mutations.
 * Dates are local civil dates (YYYY-MM-DD) in the congregation's timezone.
 */
export const categories = ["irma", "irmao_batizado", "servo_ministerial", "anciao"] as const;
export type Category = typeof categories[number];
export const eligibilityRules = ["qualquer_pessoa", "irmaos_batizados", "anciaos_e_servos", "somente_anciaos"] as const;
export type EligibilityRule = typeof eligibilityRules[number];
export interface Member {
  id: string;
  congregationId: string;
  name: string;
  category: Category;
  active: boolean;
  isVisitor?: boolean;
  unavailability: readonly { startsOn: string; endsOn: string }[];
}
export interface Part {
  id: string;
  congregationId: string;
  meetingId: string;
  eligibility: EligibilityRule;
  allowsVisitor?: boolean;
  /** Explicit per-slot refusals or other exclusions; never override eligibility. */
  excludedMemberIds?: readonly string[];
}
export interface Assignment { partId: string; memberId: string | null; locked: boolean }
/** One row per actual assignment, NOT one row per audit event. */
export interface HistoryEntry {
  assignmentId: string;
  congregationId: string;
  meetingId: string;
  memberId: string;
  date: string;
  status: "pendente" | "confirmada" | "recusada";
}
export interface SuggestInput {
  congregationId: string;
  meeting: { id: string; congregationId: string; date: string };
  members: readonly Member[];
  parts: readonly Part[];
  existing: readonly Assignment[];
  history: readonly HistoryEntry[];
}
export type ConflictCode = "member_missing" | "inactive" | "ineligible" | "unavailable" | "duplicate_locked_member";
export interface LockedConflict { partId: string; memberId: string; code: ConflictCode; message: string }
export interface UnfilledPart { partId: string; reason: "manually_locked" | "no_eligible_member" | "not_enough_distinct_members" }
export type SuggestResult =
  | { status: "blocked"; conflicts: LockedConflict[] }
  | { status: "complete" | "partial"; assignments: Assignment[]; unfilled: UnfilledPart[] };
export interface RankedCandidate { memberId: string; frequency: number; lastAssignedOn: string | null }

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function validDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000")) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
function requireDate(date: string) {
  if (!validDate(date)) throw new Error(`Data inválida: ${date}. Use uma data civil real no formato AAAA-MM-DD.`);
}
function requireUnique(ids: readonly string[], label: string) {
  if (ids.some(id => !id.trim()) || new Set(ids).size !== ids.length) throw new Error(`${label}: IDs vazios ou duplicados. Corrija os dados antes de sugerir.`);
}
export function isEligible(category: Category, rule: EligibilityRule): boolean {
  // Runtime guards also fail closed for data received from outside TypeScript.
  if (!categories.includes(category) || !eligibilityRules.includes(rule)) return false;
  switch (rule) {
    case "qualquer_pessoa": return true;
    case "irmaos_batizados": return category !== "irma";
    case "anciaos_e_servos": return category === "anciao" || category === "servo_ministerial";
    case "somente_anciaos": return category === "anciao";
  }
}
function invalidReason(member: Member | undefined, part: Part, date: string): ConflictCode | null {
  if (!member) return "member_missing";
  if (!member.active) return "inactive";
  if (part.excludedMemberIds?.includes(member.id)) return "ineligible";
  if (!isEligible(member.category, part.eligibility) || (member.isVisitor && !part.allowsVisitor)) return "ineligible";
  if (member.unavailability.some(range => range.startsOn <= date && date <= range.endsOn)) return "unavailable";
  return null;
}
function validate(input: SuggestInput): Member[] {
  if (!input.congregationId.trim() || !input.meeting.id.trim() || input.meeting.congregationId !== input.congregationId) throw new Error("A reunião precisa pertencer à congregação selecionada.");
  requireDate(input.meeting.date);
  requireUnique(input.parts.map(p => p.id), "Partes");
  requireUnique(input.existing.map(a => a.partId), "Designações");
  const members = input.members.filter(m => m.congregationId === input.congregationId);
  requireUnique(members.map(m => m.id), "Irmãos");
  const partIds = new Set(input.parts.map(p => p.id));
  for (const part of input.parts) {
    if (part.congregationId !== input.congregationId || part.meetingId !== input.meeting.id) throw new Error("Todas as partes precisam pertencer à reunião e congregação selecionadas.");
    if (!eligibilityRules.includes(part.eligibility)) throw new Error("Regra de elegibilidade desconhecida. Corrija o modelo da reunião.");
  }
  for (const a of input.existing) {
    if (!partIds.has(a.partId)) throw new Error("Há uma designação para uma parte que não existe nesta reunião.");
  }
  for (const member of members) {
    if (!categories.includes(member.category)) throw new Error("Categoria de irmão desconhecida. Corrija o cadastro.");
    for (const range of member.unavailability) {
      requireDate(range.startsOn); requireDate(range.endsOn);
      if (range.startsOn > range.endsOn) throw new Error("Indisponibilidade com intervalo invertido. Corrija as datas.");
    }
  }
  const seenHistory = new Map<string, string>();
  for (const h of input.history.filter(h => h.congregationId === input.congregationId)) {
    requireDate(h.date);
    if (!h.assignmentId.trim() || !["pendente", "confirmada", "recusada"].includes(h.status)) throw new Error("Histórico inválido. Use um registro por designação.");
    const signature = JSON.stringify([h.meetingId, h.memberId, h.date, h.status]);
    if (seenHistory.has(h.assignmentId) && seenHistory.get(h.assignmentId) !== signature) throw new Error("Histórico contém versões conflitantes da mesma designação. Consolide a auditoria primeiro.");
    seenHistory.set(h.assignmentId, signature);
  }
  return members;
}
function historyScores(input: SuggestInput, members: readonly Member[]): Map<string, RankedCandidate> {
  const scores = new Map(members.map(m => [m.id, { memberId: m.id, frequency: 0, lastAssignedOn: null } as RankedCandidate]));
  const seen = new Set<string>();
  for (const h of input.history) {
    if (h.congregationId !== input.congregationId || h.meetingId === input.meeting.id || h.date >= input.meeting.date || h.status !== "confirmada" || seen.has(h.assignmentId)) continue;
    seen.add(h.assignmentId);
    const score = scores.get(h.memberId);
    if (score) {
      score.frequency++;
      if (score.lastAssignedOn === null || h.date > score.lastAssignedOn) score.lastAssignedOn = h.date;
    }
  }
  return scores;
}
function rankCompare(a: RankedCandidate, b: RankedCandidate) {
  return a.frequency - b.frequency || compare(a.lastAssignedOn ?? "", b.lastAssignedOn ?? "") || compare(a.memberId, b.memberId);
}

/** Eligible shortlist for one slot. Other existing slots are treated as occupied
 * (including unlocked ones); use suggest() to rebalance the whole meeting.
 */
export function rankCandidates(input: SuggestInput, partId: string): RankedCandidate[] {
  const members = validate(input);
  const part = input.parts.find(p => p.id === partId);
  if (!part) throw new Error("Parte não encontrada nesta reunião.");
  const occupied = new Set(input.existing.filter(a => a.partId !== partId && a.memberId !== null).map(a => a.memberId));
  const scores = historyScores(input, members);
  return members.filter(m => !occupied.has(m.id) && invalidReason(m, part, input.meeting.date) === null).map(m => ({ ...scores.get(m.id)! })).sort(rankCompare);
}

interface Edge { to: number; reverse: number; capacity: number; cost: number }
function addEdge(graph: Edge[][], from: number, to: number, cost: number): Edge {
  const edge = { to, reverse: graph[to].length, capacity: 1, cost };
  graph[from].push(edge);
  graph[to].push({ to: from, reverse: graph[from].length - 1, capacity: 0, cost: -cost });
  return edge;
}
/** Successive shortest augmenting paths, with Bellman-Ford for reverse edges.
 * Each augmentation adds one occupied part; reverse edges can reassign earlier
 * choices. Stop only when no path exists, ensuring maximum cardinality first.
 */
function minCostMaxFlow(graph: Edge[][], source: number, sink: number) {
  for (;;) {
    const distance = Array<number>(graph.length).fill(Infinity);
    const previous = Array<{ node: number; edge: number } | undefined>(graph.length);
    distance[source] = 0;
    for (let pass = 0; pass < graph.length - 1; pass++) {
      let changed = false;
      for (let from = 0; from < graph.length; from++) {
        for (let index = 0; index < graph[from].length; index++) {
          const edge = graph[from][index];
          if (edge.capacity > 0 && distance[from] + edge.cost < distance[edge.to]) {
            distance[edge.to] = distance[from] + edge.cost;
            previous[edge.to] = { node: from, edge: index };
            changed = true;
          }
        }
      }
      if (!changed) break;
    }
    if (!previous[sink]) return;
    for (let node = sink; node !== source;) {
      const prev = previous[node]!;
      const edge = graph[prev.node][prev.edge];
      edge.capacity--;
      graph[node][edge.reverse].capacity++;
      node = prev.node;
    }
  }
}
const conflictMessages: Record<ConflictCode, string> = {
  member_missing: "A pessoa travada não está nesta congregação. Revise a designação antes de sugerir.",
  inactive: "A pessoa travada está inativa. Destrave ou escolha outra pessoa.",
  ineligible: "A pessoa travada não atende à regra atual. Revise a regra ou destrave a parte.",
  unavailable: "A pessoa travada está indisponível nesta data. Destrave para buscar substitutos.",
  duplicate_locked_member: "A mesma pessoa está travada em duas partes. Revise as travas antes de sugerir.",
};

/** Regenerates UNLOCKED slots; valid locks (even deliberately empty ones) survive.
 * A conflicting lock blocks the entire proposal; no writable assignments are
 * returned. Partial results explicitly identify shortages instead of duplicating.
 */
export function suggest(input: SuggestInput): SuggestResult {
  const members = validate(input);
  const byMember = new Map(members.map(m => [m.id, m]));
  const byPart = new Map(input.parts.map(p => [p.id, p]));
  const locked = input.existing.filter(a => a.locked).map(a => ({ ...a })).sort((a, b) => compare(a.partId, b.partId));
  const occupied = new Set<string>();
  const conflicts: LockedConflict[] = [];
  for (const assignment of locked) {
    if (assignment.memberId === null) continue;
    const code = invalidReason(byMember.get(assignment.memberId), byPart.get(assignment.partId)!, input.meeting.date)
      ?? (occupied.has(assignment.memberId) ? "duplicate_locked_member" : null);
    if (code) conflicts.push({ partId: assignment.partId, memberId: assignment.memberId, code, message: conflictMessages[code] });
    occupied.add(assignment.memberId);
  }
  if (conflicts.length) return { status: "blocked", conflicts };
  const lockedParts = new Set(locked.map(a => a.partId));
  const parts = input.parts.filter(p => !lockedParts.has(p.id)).sort((a, b) => compare(a.id, b.id));
  const available = members.filter(m => !occupied.has(m.id) && m.active).sort((a, b) => compare(a.id, b.id));
  const scores = historyScores(input, available);
  const tieOrder = [...scores.values()].sort((a, b) => compare(a.lastAssignedOn ?? "", b.lastAssignedOn ?? "") || compare(a.memberId, b.memberId));
  const tieRank = new Map(tieOrder.map((s, i) => [s.memberId, i]));
  // One frequency unit outweighs the TOTAL possible tie-break cost.
  const frequencyWeight = (parts.length + 1) * (available.length + 1);
  const source = 0, partStart = 1, memberStart = partStart + parts.length, sink = memberStart + available.length;
  const graph: Edge[][] = Array.from({ length: sink + 1 }, () => []);
  const choices: { partId: string; memberId: string; edge: Edge }[] = [];
  const candidateCounts = new Map<string, number>();
  available.forEach((m, index) => {
    const cost = scores.get(m.id)!.frequency * frequencyWeight + tieRank.get(m.id)!;
    if (!Number.isSafeInteger(cost * (parts.length + 1))) throw new Error("Histórico grande demais para calcular o custo com segurança. Reduza a janela de histórico.");
    addEdge(graph, memberStart + index, sink, cost);
  });
  parts.forEach((part, index) => {
    addEdge(graph, source, partStart + index, 0);
    const count = members.filter(m => invalidReason(m, part, input.meeting.date) === null).length;
    available.forEach((member, memberIndex) => {
      if (invalidReason(member, part, input.meeting.date) === null) {
        choices.push({ partId: part.id, memberId: member.id, edge: addEdge(graph, partStart + index, memberStart + memberIndex, 0) });
      }
    });
    candidateCounts.set(part.id, count);
  });
  minCostMaxFlow(graph, source, sink);
  const chosen = new Map(choices.filter(c => c.edge.capacity === 0).map(c => [c.partId, c.memberId]));
  const assignments: Assignment[] = [...locked, ...parts.map(p => ({ partId: p.id, memberId: chosen.get(p.id) ?? null, locked: false }))].sort((a, b) => compare(a.partId, b.partId));
  const unfilled: UnfilledPart[] = assignments.filter(a => a.memberId === null).map(a => ({
    partId: a.partId,
    reason: a.locked ? "manually_locked" : candidateCounts.get(a.partId) === 0 ? "no_eligible_member" : "not_enough_distinct_members",
  }));
  return { status: unfilled.length ? "partial" : "complete", assignments, unfilled };
}

/** An explicit rule edit invalidates ineligible occupants, INCLUDING locks.
 * This is separate from suggesting: callers can show removals before persisting.
 * The database independently enforces this same cleanup in its trigger.
 */
export function changePartEligibility(input: SuggestInput, partId: string, rule: EligibilityRule): { parts: Part[]; assignments: Assignment[]; removed: Assignment[] } {
  const members = validate(input);
  if (!eligibilityRules.includes(rule)) throw new Error("Regra de elegibilidade desconhecida.");
  if (!input.parts.some(p => p.id === partId)) throw new Error("Parte não encontrada nesta reunião.");
  const parts = input.parts.map(p => ({ ...p, eligibility: p.id === partId ? rule : p.eligibility }));
  const part = parts.find(p => p.id === partId)!;
  const byMember = new Map(members.map(m => [m.id, m]));
  const removed: Assignment[] = [];
  const assignments = input.existing.map(a => {
    const member = a.memberId === null ? undefined : byMember.get(a.memberId);
    if (a.partId === partId && a.memberId !== null && (!member || !isEligible(member.category, rule) || (member.isVisitor && !part.allowsVisitor))) {
      removed.push({ ...a });
      return { partId: a.partId, memberId: null, locked: false };
    }
    return { ...a };
  });
  return { parts, assignments, removed };
}
