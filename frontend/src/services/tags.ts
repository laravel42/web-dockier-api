import { request } from "./request";

export interface Tag {
  id: string;
  name: string;
  color: string;
  createdAt: string;
}

export const tagsApi = {
  /** List all organization tags */
  list: () =>
    request<{ tags: Tag[] }>("/projects/tags"),

  /** Create a new tag */
  create: (data: { name: string; color?: string }) =>
    request<Tag>("/projects/tags", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  /** Update a tag */
  update: (tagId: string, data: { name?: string; color?: string }) =>
    request<Tag>(`/projects/tags/${tagId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  /** Delete a tag */
  delete: (tagId: string) =>
    request(`/projects/tags/${tagId}`, { method: "DELETE" }),

  /** Get tags assigned to a project */
  getProjectTags: (projectId: string) =>
    request<{ tags: Tag[] }>(`/projects/${projectId}/tags`),

  /** Set tags for a project (replaces all existing) */
  setProjectTags: (projectId: string, tagIds: string[]) =>
    request<{ tags: Tag[] }>(`/projects/${projectId}/tags`, {
      method: "PUT",
      body: JSON.stringify({ tagIds }),
    }),
};
