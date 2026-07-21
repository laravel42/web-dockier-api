import { supabaseAdmin } from "../../../shared/supabase/client.js";
import { throwOnError, unwrapQuery, unwrapList } from "../../../shared/supabase/query.js";
import { createDomainErrorClass } from "../../../shared/supabase/errors.js";

export const TagsError = createDomainErrorClass<"not_found" | "forbidden" | "bad_request" | "internal">("TagsError");
export type TagsError = InstanceType<typeof TagsError>;

// ─── Types ───

export interface TagRow {
  id: string;
  organization_id: string;
  name: string;
  color: string;
  created_at: string;
}

export interface TagResponse {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

function rowToTag(row: TagRow): TagResponse {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  };
}

// ─── Tag CRUD ───

export async function listTags(tenantId: string): Promise<TagResponse[]> {
  const { data, error } = await supabaseAdmin
    .from("project_tags")
    .select("*")
    .eq("organization_id", tenantId)
    .order("name", { ascending: true });

  const rows = unwrapList(data, error, TagsError, { internalMsg: "Failed to list tags" });
  return rows.map((r) => rowToTag(r as TagRow));
}

export interface TagWithCountResponse extends TagResponse {
  projectCount: number;
}

export async function listTagsWithCounts(tenantId: string): Promise<TagWithCountResponse[]> {
  const { data, error } = await supabaseAdmin
    .from("project_tags")
    .select("*, project_tag_assignments(count)")
    .eq("organization_id", tenantId)
    .eq("project_tag_assignments.organization_id", tenantId)
    .order("name", { ascending: true });

  const rows = unwrapList(data, error, TagsError, { internalMsg: "Failed to list tags" });

  type TagRowWithCount = TagRow & { project_tag_assignments: [{ count: number }] };

  return rows.map((r) => {
    const row = r as unknown as TagRowWithCount;
    const tag = rowToTag(row);
    const projectCount = row.project_tag_assignments?.[0]?.count ?? 0;
    return { ...tag, projectCount };
  });
}

export async function createTag(params: {
  tenantId: string;
  name: string;
  color?: string;
}): Promise<TagResponse> {
  const { tenantId, name, color } = params;

  if (!name.trim()) throw new TagsError("Tag name is required", "bad_request");

  const { data, error } = await supabaseAdmin
    .from("project_tags")
    .insert({
      organization_id: tenantId,
      name: name.trim().toLowerCase(),
      color: color ?? "#3b82f6",
    })
    .select()
    .single();

  const row = unwrapQuery(data, error, TagsError, {
    internalMsg: "Failed to create tag",
    duplicateMsg: "A tag with this name already exists",
  });

  return rowToTag(row as TagRow);
}

export async function updateTag(params: {
  tenantId: string;
  tagId: string;
  name?: string;
  color?: string;
}): Promise<TagResponse> {
  const { tenantId, tagId, name, color } = params;

  const updates: Partial<{ name: string; color: string }> = {};
  if (name !== undefined) updates.name = name.trim().toLowerCase();
  if (color !== undefined) updates.color = color;

  const { data, error } = await supabaseAdmin
    .from("project_tags")
    .update(updates)
    .eq("id", tagId)
    .eq("organization_id", tenantId)
    .select()
    .single();

  const row = unwrapQuery(data, error, TagsError, {
    notFoundMsg: "Tag not found",
    internalMsg: "Failed to update tag",
    duplicateMsg: "A tag with this name already exists",
  });

  return rowToTag(row as TagRow);
}

export async function deleteTag(params: {
  tenantId: string;
  tagId: string;
}): Promise<void> {
  const { tenantId, tagId } = params;

  const { error, count } = await supabaseAdmin
    .from("project_tags")
    .delete({ count: "exact" })
    .eq("id", tagId)
    .eq("organization_id", tenantId);

  throwOnError(error, TagsError, { internalMsg: "Failed to delete tag" });
  if (count === 0) throw new TagsError("Tag not found", "not_found");
}

// ─── Tag Assignments ───

export async function getProjectTags(params: {
  tenantId: string;
  projectId: string;
}): Promise<TagResponse[]> {
  const { tenantId, projectId } = params;

  const { data, error } = await supabaseAdmin
    .from("project_tag_assignments")
    .select("tag_id")
    .eq("organization_id", tenantId)
    .eq("project_id", projectId);

  throwOnError(error, TagsError, { internalMsg: "Failed to fetch project tags" });
  if (!data || data.length === 0) return [];

  const tagIds = data.map((r) => r.tag_id);

  const { data: tags, error: tagsError } = await supabaseAdmin
    .from("project_tags")
    .select("*")
    .eq("organization_id", tenantId)
    .in("id", tagIds)
    .order("name", { ascending: true });

  const tagRows = unwrapList(tags, tagsError, TagsError, { internalMsg: "Failed to fetch tags" });
  return tagRows.map((r) => rowToTag(r as TagRow));
}

export async function setProjectTags(params: {
  tenantId: string;
  projectId: string;
  tagIds: string[];
}): Promise<TagResponse[]> {
  const { tenantId, projectId, tagIds } = params;
  const uniqueTagIds = [...new Set(tagIds)];

  // Use the atomic RPC that validates, deletes, and inserts in a single transaction
  const { data, error } = await supabaseAdmin.rpc("set_project_tags", {
    p_organization_id: tenantId,
    p_project_id: projectId,
    p_tag_ids: uniqueTagIds,
  });

  if (error) {
    // P0002 = no_data_found raised by our RPC when tag IDs don't belong to tenant
    if (error.code === "P0002") {
      throw new TagsError("One or more tags not found", "bad_request");
    }
    throw new TagsError("Failed to update project tags", "internal", error);
  }

  const rows = (data ?? []) as unknown as TagRow[];
  return rows.map((r) => rowToTag(r));
}
