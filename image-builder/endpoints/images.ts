// ─── Image Endpoints ───

import { api, APIError } from "encore.dev/api";
import {
  db, rowToBuild,
  type ImageForRevisionResponse,
} from "../shared";

// ─── API: Get Image for Revision ───

export const getImageForRevision = api(
  { method: "GET", path: "/image-builder/images/:revision", auth: true },
  async (params: { revision: string }): Promise<ImageForRevisionResponse> => {
    const row = await db.queryRow`
      SELECT * FROM builds
      WHERE (commit_sha LIKE ${params.revision + "%"} OR source_ref = ${params.revision})
        AND status = 'succeeded' AND image_uri != ''
      ORDER BY created_at DESC LIMIT 1`;
    if (!row) throw APIError.notFound(`No successful build found for revision: ${params.revision}`);
    const build = rowToBuild(row);
    return { imageUri: build.imageUri, buildId: build.id, commitSha: build.commitSha, status: build.status, createdAt: build.createdAt };
  }
);
