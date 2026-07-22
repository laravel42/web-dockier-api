import { request } from "./request";

export const wpConfigApi = {
  /** Get masked wp-config.php (sensitive values hidden) */
  getMasked: (projectId: string) =>
    request<{ content: string; exists: boolean }>(`/projects/${projectId}/wp-config`),

  /** Reveal full decrypted wp-config.php */
  reveal: (projectId: string) =>
    request<{ content: string; exists: boolean }>(`/projects/${projectId}/wp-config/reveal`),

  /** Save wp-config.php content */
  save: (projectId: string, content: string) =>
    request<{ success: true }>(`/projects/${projectId}/wp-config`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
};
