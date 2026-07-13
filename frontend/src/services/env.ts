import { request } from "./request";

export const envApi = {
  /** Get masked env file (values hidden) */
  getMasked: (projectId: string) =>
    request<{ content: string; exists: boolean }>(`/projects/${projectId}/env`),

  /** Reveal full decrypted env file */
  reveal: (projectId: string) =>
    request<{ content: string; exists: boolean }>(`/projects/${projectId}/env/reveal`),

  /** Save env file content */
  save: (projectId: string, content: string) =>
    request<{ success: true }>(`/projects/${projectId}/env`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
};
