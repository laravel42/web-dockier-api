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

  if (error) throw new TagsError("Failed to fetch project tags", "internal", error);
  if (!data || data.length === 0) return [];

  const tagIds = data.map((r) => r.tag_id);

  const { data: tags, error: tagsError } = await supabaseAdmin
    .from("project_tags")
    .select("*")
    .eq("organization_id", tenantId)
    .in("id", tagIds)
    .order("name", { ascending: true });

  if (tagsError) throw new TagsError("Failed to fetch tags", "internal", tagsError);
  return (tags || []).map((r) => rowToTag(r as TagRow));
}

export async function setProjectTags(params: {
  tenantId: string;
  projectId: string;
  tagIds: string[];
}): Promise<TagResponse[]> {
  const { tenantId, projectId, tagIds } = params;

  // Remove all existing assignments for this project
  const { error: deleteError } = await supabaseAdmin
    .from("project_tag_assignments")
    .delete()
    .eq("organization_id", tenantId)
    .eq("project_id", projectId);

  if (deleteError) throw new TagsError("Failed to update project tags", "internal", deleteError);

  // Insert new assignments
  if (tagIds.length > 0) {
    const rows = tagIds.map((tagId) => ({
      organization_id: tenantId,
      project_id: projectId,
      tag_id: tagId,
    }));

    const { error: insertError } = await supabaseAdmin
      .from("project_tag_assignments")
      .insert(rows);

    if (insertError) throw new TagsError("Failed to assign tags", "internal", insertError);
  }

  // Return the updated tag list
  return getProjectTags({ tenantId, projectId });
}
