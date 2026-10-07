/**
 * Retry a stalled or failed domain attachment.
 *
 * ONE rule governs every case: only a TERMINAL row (`timed_out` or `failed`) is
 * reset to `pending` with a fresh phase clock. Every other state is left
 * untouched and simply re-enqueued, because the attachment is already
 * progressing and rewriting its state would move the phase clock and push its
 * own deadline out.
 */

import { getDomainById, DomainsError } from "./domains.js";
import { enqueueDomainApply } from "./worker.js";
import { getDomainAttachment } from "./applier.js";
import { resolveStaticCloud } from "./static/cloud.js";
import { findStaticCertRow, setCertState } from "./static/certs.js";
import { normalizeHost } from "./static/apex.js";
import type { CertVerificationState } from "./mappers.js";
import { nowIso } from "../../../shared/utils/time.js";

export interface ResumeResult {
  success: boolean;
  message: string;
  verificationState: CertVerificationState;
}

const TERMINAL: readonly CertVerificationState[] = ["timed_out", "failed"];

export async function resumeDomainAttachment(params: {
  tenantId: string;
  projectId: string;
  domainId: string;
}): Promise<ResumeResult> {
  const { tenantId, projectId, domainId } = params;

  const domain = await getDomainById({ tenantId, projectId, domainId });
  if (!domain) throw new DomainsError("Domain not found.", "not_found");

  const { cloud } = await resolveStaticCloud(projectId, tenantId);
  if (!cloud) {
    // Nothing is enqueued: there is no certificate attachment on this branch.
    throw new DomainsError(
      "This project is not a static deployment, so there is no certificate attachment to resume.",
      "conflict",
    );
  }

  const host = normalizeHost(domain.name);
  const found = await findStaticCertRow(projectId, host);
  const row = found.ok ? found.row : null;

  let verificationState: CertVerificationState = row?.verificationState ?? "pending";

  if (row && TERMINAL.includes(row.verificationState)) {
    await setCertState(
      row.id,
      {
        verificationState: "pending",
        verificationMessage: null,
        // The one place the clock is set EXPLICITLY rather than left to the
        // phase-clock invariant: resume deliberately restarts the budget, and
        // a `pending` row's 30-minute deadline reads this clock.
        attachStartedAt: nowIso(),
      },
      row.verificationState,
    );
    verificationState = "pending";
  }

  // Enqueued in every surviving case, including when there is no certificate
  // row at all — the job is what creates it.
  await enqueueDomainApply(tenantId, projectId);

  // A blocker is deliberately NOT a 4xx: nothing is wrong with the request,
  // and the instruction is "redeploy first". The job is still enqueued.
  const attachment = await getDomainAttachment({ tenantId, projectId });
  if (attachment.blocker) {
    return { success: true, message: attachment.blocker, verificationState };
  }

  return {
    success: true,
    message: `Retrying the attachment for ${host}. Progress continues on its own.`,
    verificationState,
  };
}
