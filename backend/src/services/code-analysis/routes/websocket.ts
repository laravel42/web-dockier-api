import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import { verifyAuthToken } from "../../../shared/auth/auth.js";
import { getScan } from "../domain/scans.js";
import {
  subscribeToScan,
  unsubscribeFromScan,
  sendScanSnapshot,
} from "../domain/scan-events.js";

export async function registerScanWebSocketRoutes(app: FastifyInstance) {
  await app.register(websocket);

  app.get(
    "/code-analysis/scans/:scanId/ws",
    { websocket: true },
    async (socket, request) => {
      const scanId = (request.params as { scanId: string }).scanId;
      const token = (request.query as { token?: string }).token;
      if (!token) {
        socket.close(1008, "Missing token");
        return;
      }

      const auth = verifyAuthToken(token);
      if (!auth) {
        socket.close(1008, "Unauthorized");
        return;
      }

      try {
        const scan = await getScan(scanId, auth.tenantId);
        subscribeToScan(scanId, socket);
        sendScanSnapshot(
          socket,
          scanId,
          scan.status,
          scan.summary as unknown as Record<string, unknown>,
        );

        socket.on("close", () => unsubscribeFromScan(scanId, socket));
      } catch {
        socket.close(1008, "Scan not found");
      }
    },
  );
}
