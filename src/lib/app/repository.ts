import type { SupabaseClient } from "@supabase/supabase-js";
import type { Command, Membership, Slot, Workspace } from "./types";
type Row = Record<string, unknown>;
const text = (r: Row, k: string) => String(r[k] ?? "");
function slot(r: Row): Slot {
  return {
    id: text(r, "id"),
    title: text(r, "title"),
    section: text(r, "section"),
    position: Number(r.position),
    groupKey: r.group_key === null ? null : text(r, "group_key"),
    slot: r.slot as Slot["slot"],
    eligibility: r.eligibility as Slot["eligibility"],
    allowsVisitor: r.allows_visitor === true,
  };
}
export function membership(r: Row): Membership {
  return {
    userId: text(r, "user_id"),
    congregationId: text(r, "congregation_id"),
    memberId: text(r, "member_id"),
    role: r.role as Membership["role"],
  };
}
async function rows(
  client: SupabaseClient,
  table: string,
  cid: string,
  order = "id",
): Promise<Row[]> {
  const result: Row[] = [];
  for (let start = 0; ; start += 1000) {
    const query = client
      .from(table)
      .select("*")
      .eq(table === "congregations" ? "id" : "congregation_id", cid)
      .order(order)
      .range(start, start + 999);
    const { data, error } = await query;
    if (error) throw error;
    result.push(...data);
    if (data.length < 1000) return result;
  }
}
export async function loadWorkspace(
  client: SupabaseClient,
  selected: Membership,
): Promise<Workspace> {
  const staff = selected.role !== "irmao";
  const [
    congregations,
    members,
    phones,
    availability,
    templates,
    templateParts,
    meetings,
    parts,
    assignments,
    audit,
    memberships,
  ] = await Promise.all([
    rows(client, "congregations", selected.congregationId),
    rows(client, "members", selected.congregationId),
    staff
      ? rows(client, "member_phones", selected.congregationId, "member_id")
      : Promise.resolve([]),
    rows(client, "unavailability", selected.congregationId),
    staff
      ? rows(client, "meeting_templates", selected.congregationId)
      : Promise.resolve([]),
    staff
      ? rows(client, "template_parts", selected.congregationId)
      : Promise.resolve([]),
    rows(client, "meetings", selected.congregationId),
    rows(client, "meeting_parts", selected.congregationId),
    rows(client, "assignments", selected.congregationId),
    rows(client, "assignment_history", selected.congregationId),
    rows(
      client,
      "congregation_memberships",
      selected.congregationId,
      "user_id",
    ),
  ]);
  const c = congregations[0];
  if (!c)
    throw new Error(
      "Seu vínculo não está disponível. Peça ao administrador para revisar seu acesso.",
    );
  return {
    congregation: {
      id: text(c, "id"),
      name: text(c, "name"),
      timezone: text(c, "timezone"),
    },
    membership:
      memberships.map(membership).find((m) => m.userId === selected.userId) ??
      selected,
    memberships: memberships.map(membership),
    members: members.map((m) => ({
      id: text(m, "id"),
      congregationId: selected.congregationId,
      name: text(m, "name"),
      category: m.category as Workspace["members"][number]["category"],
      active: m.active === true,
      isVisitor: m.is_visitor === true,
      whatsapp:
        (phones.find((p) => p.member_id === m.id)?.whatsapp as string) ?? "",
      unavailability: availability
        .filter((a) => a.member_id === m.id)
        .map((a) => ({
          id: text(a, "id"),
          startsOn: text(a, "starts_on"),
          endsOn: text(a, "ends_on"),
        })),
    })),
    templates: templates.map((t) => ({
      id: text(t, "id"),
      name: text(t, "name"),
      kind: t.kind as Workspace["templates"][number]["kind"],
      weekday: Number(t.weekday),
      time: text(t, "local_time").slice(0, 5),
      parts: templateParts
        .filter((p) => p.template_id === t.id && p.active)
        .map(slot)
        .sort((a, b) => a.position - b.position),
    })),
    meetings: meetings.map((m) => ({
      id: text(m, "id"),
      templateId: text(m, "template_id"),
      title: text(m, "title"),
      kind: m.kind as Workspace["meetings"][number]["kind"],
      startsAt: text(m, "starts_at"),
      revision: Number(m.revision),
      parts: parts
        .filter((p) => p.meeting_id === m.id)
        .map((p) => ({
          ...slot(p),
          emptyLocked: p.empty_locked === true,
          templatePartId: text(p, "template_part_id"),
        }))
        .sort((a, b) => a.position - b.position),
    })),
    assignments: assignments.map((a) => ({
      id: text(a, "id"),
      meetingId: text(a, "meeting_id"),
      partId: text(a, "part_id"),
      memberId: text(a, "member_id"),
      locked: a.locked === true,
      status: a.status as Workspace["assignments"][number]["status"],
    })),
    audit: audit.map((a) => ({
      id: text(a, "id"),
      assignmentId: text(a, "assignment_id"),
      meetingId: text(a, "meeting_id"),
      partId: text(a, "part_id"),
      memberId: text(a, "member_id"),
      action: text(a, "action"),
      status: a.status as Workspace["audit"][number]["status"],
      occurredAt: text(a, "occurred_at"),
    })),
  };
}
export async function execute(
  client: SupabaseClient,
  cid: string,
  command: Command,
) {
  let result: { error: unknown };
  switch (command.type) {
    case "response":
      result = await client.rpc("respond_assignment", {
        aid: command.assignmentId,
        expected_status: command.expectedStatus,
        answer: command.answer,
      });
      break;
    case "member": {
      const v = command.value;
      result = await client.rpc("save_member", {
        cid,
        mid: v.id,
        member_name: v.name,
        member_category: v.category,
        is_active: v.active,
        visitor: v.isVisitor,
        phone: v.whatsapp.replace(/\D/g, ""),
      });
      break;
    }
    case "template": {
      const v = command.value;
      result = await client.rpc("save_template", {
        cid,
        tid: command.isNew ? null : v.id,
        template_name: v.name,
        meeting_type: v.kind,
        day_of_week: v.weekday,
        meeting_time: v.time,
        slots: v.parts.map((p, position) => ({
          id: p.id,
          title: p.title,
          section: p.section,
          position,
          group_key: p.groupKey,
          slot: p.slot,
          eligibility: p.eligibility,
          allows_visitor: p.allowsVisitor,
        })),
      });
      break;
    }
    case "week":
      result = await client.rpc("create_week", { cid, monday: command.monday });
      break;
    case "assignments":
      result = await client.rpc("save_assignments", {
        cid,
        mid: command.meetingId,
        expected_revision: command.revision,
        proposal: command.rows.map((a) => ({
          part_id: a.partId,
          member_id: a.memberId,
          locked: a.locked,
        })),
      });
      break;
    case "rule":
      result = await client
        .from("meeting_parts")
        .update({ eligibility: command.rule })
        .eq("congregation_id", cid)
        .eq("meeting_id", command.meetingId)
        .eq("id", command.partId)
        .select()
        .single();
      break;
    case "availability":
      result = await client.from("unavailability").insert({
        congregation_id: cid,
        member_id: command.memberId,
        starts_on: command.startsOn,
        ends_on: command.endsOn,
      });
      break;
    case "removeAvailability":
      result = await client
        .from("unavailability")
        .delete()
        .eq("congregation_id", cid)
        .eq("id", command.id)
        .select()
        .single();
      break;
    case "membership": {
      const v = command.value;
      result = await client.from("congregation_memberships").upsert(
        {
          congregation_id: cid,
          user_id: v.userId,
          member_id: v.memberId,
          role: v.role,
        },
        { onConflict: "congregation_id,user_id" },
      );
      break;
    }
  }
  if (result.error) throw result.error;
}
