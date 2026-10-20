import type { Assignment, Category, EligibilityRule, Member } from "../suggest";
export type Role = "administrador" | "designador" | "irmao";
export type Status = "pendente" | "confirmada" | "recusada";
export type Kind = "meio_de_semana" | "fim_de_semana";
export interface Person extends Member {
  whatsapp: string;
  unavailability: { id: string; startsOn: string; endsOn: string }[];
}
export interface Slot {
  id: string;
  title: string;
  section: string;
  position: number;
  groupKey: string | null;
  slot: "titular" | "ajudante" | "dirigente" | "leitor";
  eligibility: EligibilityRule;
  allowsVisitor: boolean;
}
export interface Template {
  id: string;
  name: string;
  kind: Kind;
  weekday: number;
  time: string;
  parts: Slot[];
}
export interface Meeting {
  id: string;
  templateId: string;
  title: string;
  kind: Kind;
  startsAt: string;
  revision: number;
  parts: (Slot & { emptyLocked: boolean; templatePartId?: string })[];
}
export interface StoredAssignment extends Assignment {
  id: string;
  meetingId: string;
  status: Status;
}
export interface Audit {
  id: string;
  assignmentId: string;
  meetingId: string;
  partId: string;
  memberId: string;
  action: string;
  status: Status;
  occurredAt: string;
}
export interface Membership {
  userId: string;
  congregationId: string;
  memberId: string;
  role: Role;
}
export interface Workspace {
  congregation: { id: string; name: string; timezone: string };
  membership: Membership;
  memberships: Membership[];
  members: Person[];
  templates: Template[];
  meetings: Meeting[];
  assignments: StoredAssignment[];
  audit: Audit[];
}
export interface MemberDraft {
  id: string | null;
  name: string;
  category: Category;
  active: boolean;
  isVisitor: boolean;
  whatsapp: string;
}
export type Command =
  | {
      type: "response";
      assignmentId: string;
      expectedStatus: Status;
      answer: "confirmada" | "recusada";
    }
  | { type: "member"; value: MemberDraft }
  | { type: "template"; value: Template; isNew: boolean }
  | { type: "week"; monday: string }
  | {
      type: "assignments";
      meetingId: string;
      revision: number;
      rows: Assignment[];
    }
  | { type: "rule"; meetingId: string; partId: string; rule: EligibilityRule }
  | { type: "availability"; memberId: string; startsOn: string; endsOn: string }
  | { type: "removeAvailability"; id: string }
  | { type: "membership"; value: Membership };
export const categoryLabels: Record<Category, string> = {
  irma: "Irmã",
  irmao_batizado: "Irmão batizado",
  servo_ministerial: "Servo ministerial",
  anciao: "Ancião",
};
export const ruleLabels: Record<EligibilityRule, string> = {
  qualquer_pessoa: "Qualquer pessoa",
  irmaos_batizados: "Irmãos batizados",
  anciaos_e_servos: "Anciãos e servos",
  somente_anciaos: "Somente anciãos",
};
export const kindLabels: Record<Kind, string> = {
  meio_de_semana: "Meio de semana",
  fim_de_semana: "Fim de semana",
};
export const roleLabels: Record<Role, string> = {
  administrador: "Administrador",
  designador: "Designador",
  irmao: "Irmão",
};
