import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { broadcastScanEvent, type ScanWsMessage } from "./scan-events.js";
import type { RunScanOptions } from "./scan-worker.js";

interface ScanJobInput {
  scanId: string;
  tenantId: string;
  options: RunScanOptions;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

interface ScanIpcMessage {
  type: "scan-event";
  scanId: string;
  message: ScanWsMessage;
}

/** tsx only exports the loader on "." — dist/cli.mjs is not in "exports". */
function resolveTsxLoader(): string {
  const backendPkg = join(__dirname, "../../../../package.json");
  const require = createRequire(backendPkg);
  return require.resolve("tsx");
}

function relayScanIpc(msg: unknown): void {
  if (!msg || typeof msg !== "object") return;
  const payload = msg as Partial<ScanIpcMessage>;
  if (payload.type !== "scan-event" || !payload.scanId || !payload.message) return;
  broadcastScanEvent(payload.scanId, payload.message);
}

export function runScanInSubprocess(input: ScanJobInput): Promise<void> {
  return new Promise((resolve, reject) => {
    const runnerPath = join(__dirname, "scan-runner.ts");
    const tsxLoader = resolveTsxLoader();

    let child: ChildProcess;
    try {
      child = spawn(process.execPath, ["--import", tsxLoader, runnerPath, JSON.stringify(input)], {
        stdio: ["ignore", "inherit", "inherit", "ipc"],
        env: process.env,
      });
    } catch (err) {
      reject(err);
      return;
    }

    child.on("message", relayScanIpc);

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      const detail = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
      reject(new Error(`Scan subprocess exited with ${detail}`));
    });
  });
}
