/**
 * What stage is this domain's attachment at, and who is it waiting on?
 *
 * Pure functions of a snapshot, so the whole matrix is directly unit-testable.
 *
 * TWO THINGS ARE EASY TO GET WRONG HERE.
 *
 * 1. The obvious completion rule — everything before the current stage is
 *    `done`, everything after is `pending` — is WRONG on AWS. `aws.ts` writes
 *    `status` and `verificationState` in the same call, so
 *    `awaiting_dns` + `status === "active"` cannot occur until the attach has
 *    already run: stage (e) becomes current AFTER stage (f) has completed. A
 *    position-based rule would either show the finished CloudFront update as
 *    pending, or show "publish the routing record" as done while it is the one
 *    thing blocking the user. So the full matrix is transcribed, cell by cell.
 *
 * 2. `status` is the SOLE discriminator between stage (c) and stage (e), both
 *    of which are `awaiting_dns`. `attach_started_at` is explicitly not a
 *    discriminator — it is the current phase's start and is re-stamped on every
 *    phase entry, so it carries no information about WHICH phase this is. The
 *    same `status` split drives the cadence and deadline tables, so there is
 *    one discriminator in the whole design rather than three.
 */

import type { CertVerificationState } from "../mappers.js";

export type StageOwner = "you" | "dockier" | "aws" | "google";
export type StageStatus = "done" | "current" | "pending" | "failed";

export interface AttachmentStage {
  id: string;
  label: string;
  /** Who the next move belongs to. `undefined` on a terminal "serving" stage. */
  owner?: StageOwner;
  status: StageStatus;
  detail?: string;
  /** A realistic wait, from observed behaviour. No stage is instantaneous. */
  eta?: string;
}

/** Everything the builders need. Every field is already on `StaticCertRow`. */
export interface CertSnapshot {
  domainName: string;
  verificationState: CertVerificationState;
  /** `"active"` means the certificate is issued and attached. */
  status: string;
  verificationMessage: string | null;
}

const TERMINAL_STATES = new Set<CertVerificationState>(["failed", "timed_out"]);

/**
 * `timed_out` is always resumable — that is the state's whole purpose. A
 * `failed` row is resumable too: the classifier's permanent failures are all
 * things an operator can fix (a migration, an IAM grant, a redeploy), after
 * which the user needs a way to re-run without removing and re-adding.
 */
function isResumable(state: CertVerificationState): boolean {
  return TERMINAL_STATES.has(state);
}

export interface StageView {
  stages: AttachmentStage[];
  resumable: boolean;
}

function terminalStage(snapshot: CertSnapshot): AttachmentStage {
  return {
    id: "terminal",
    label: snapshot.verificationState === "timed_out" ? "Timed out" : "Failed",
    status: "failed",
    detail: snapshot.verificationMessage ?? undefined,
  };
}

/** The seven AWS stages, in order. */
function awsStageShells(snapshot: CertSnapshot): AttachmentStage[] {
  return [
    { id: "added", label: "Domain added", owner: "dockier", status: "pending" },
    {
      id: "requested",
      label: "Certificate requested from AWS",
      owner: "dockier",
      status: "pending",
      eta: "seconds",
    },
    {
      id: "publish-validation",
      label: "Publish the certificate validation record",
      owner: "you",
      status: "pending",
      detail:
        "Leave this record published after issuance — it is what lets AWS renew the certificate automatically.",
    },
    {
      id: "validating",
      label: "AWS is validating the certificate",
      owner: "aws",
      status: "pending",
      eta: "usually a few minutes once the record is visible",
    },
    {
      id: "publish-routing",
      label: "Publish the routing record",
      owner: "you",
      status: "pending",
    },
    {
      id: "attaching",
      label: "Attaching the certificate to CloudFront",
      owner: "aws",
      status: "pending",
      eta: "5-20 minutes",
    },
    { id: "serving", label: `Serving ${snapshot.domainName} over HTTPS`, status: "pending" },
  ];
}

/**
 * The AWS matrix, transcribed. Index order is a, b, c, d, e, f, g.
 *
 * Note the `awaiting_dns` + `active` row: (e) current AND (f) done. That is the
 * only non-monotonic row in either cloud.
 */
function awsStatuses(snapshot: CertSnapshot): StageStatus[] {
  const { verificationState: state, status } = snapshot;

  switch (state) {
    case "pending":
      return ["done", "current", "pending", "pending", "pending", "pending", "pending"];
    case "awaiting_dns":
      return status === "active"
        ? ["done", "done", "done", "done", "current", "done", "pending"]
        : ["done", "done", "current", "pending", "pending", "pending", "pending"];
    case "provisioning":
      return ["done", "done", "done", "current", "pending", "pending", "pending"];
    case "attaching":
      return ["done", "done", "done", "done", "pending", "current", "pending"];
    case "live":
      return ["done", "done", "done", "done", "done", "done", "done"];
    default:
      // Terminal states never reach here — handled before the matrix.
      return ["done", "done", "pending", "pending", "pending", "pending", "pending"];
  }
}

export function buildAwsStages(snapshot: CertSnapshot): StageView {
  if (TERMINAL_STATES.has(snapshot.verificationState)) {
    const shells = awsStageShells(snapshot);
    // (a) and (b) stay `done` because they demonstrably happened; the trailing
    // stages are replaced by one terminal stage rather than a menu of guesses.
    return {
      stages: [
        { ...shells[0], status: "done" },
        { ...shells[1], status: "done" },
        terminalStage(snapshot),
      ],
      resumable: isResumable(snapshot.verificationState),
    };
  }

  const shells = awsStageShells(snapshot);
  const statuses = awsStatuses(snapshot);

  return {
    stages: shells.map((stage, i) => {
      const status = statuses[i];
      // Surface the row's own message on whichever stage is current, so the
      // explanation sits next to the thing it explains.
      const detail =
        status === "current" && snapshot.verificationMessage
          ? snapshot.verificationMessage
          : stage.detail;
      return { ...stage, status, detail };
    }),
    resumable: false,
  };
}

/** The five GCP stages. No validation-record stage, and fully monotonic. */
function gcpStageShells(snapshot: CertSnapshot): AttachmentStage[] {
  return [
    { id: "added", label: "Domain added", owner: "dockier", status: "pending" },
    {
      id: "frontend",
      label: "HTTPS front end created on the load balancer",
      owner: "dockier",
      status: "pending",
      eta: "under a minute",
    },
    {
      id: "publish-a",
      label: "Publish the A record to the load balancer IP",
      owner: "you",
      status: "pending",
    },
    {
      id: "validating",
      label: "Google is validating by reaching your site at this domain",
      owner: "google",
      status: "pending",
      eta: "15-60 minutes after the A record is live",
    },
    { id: "serving", label: `Serving ${snapshot.domainName} over HTTPS`, status: "pending" },
  ];
}

/**
 * The GCP matrix. Fully monotonic, and `status` is NOT a discriminator.
 *
 * There is no post-attach wait on GCP: Google cannot issue the certificate
 * until the A record is already live, so "publish the A record" strictly
 * precedes "Google is validating", and `attaching` never occurs. That asymmetry
 * is the whole reason the two clouds get separate builders.
 */
function gcpStatuses(snapshot: CertSnapshot): StageStatus[] {
  switch (snapshot.verificationState) {
    case "pending":
      return ["done", "current", "pending", "pending", "pending"];
    case "awaiting_dns":
      return ["done", "done", "current", "pending", "pending"];
    case "provisioning":
      return ["done", "done", "done", "current", "pending"];
    case "live":
      return ["done", "done", "done", "done", "done"];
    case "attaching":
      // Unreachable today, but the CHECK permits it. Treated as the validating
      // phase rather than guessed at.
      return ["done", "done", "done", "current", "pending"];
    default:
      return ["done", "done", "pending", "pending", "pending"];
  }
}

export function buildGcpStages(snapshot: CertSnapshot): StageView {
  if (TERMINAL_STATES.has(snapshot.verificationState)) {
    const shells = gcpStageShells(snapshot);
    return {
      stages: [
        { ...shells[0], status: "done" },
        { ...shells[1], status: "done" },
        terminalStage(snapshot),
      ],
      resumable: isResumable(snapshot.verificationState),
    };
  }

  const shells = gcpStageShells(snapshot);
  const statuses = gcpStatuses(snapshot);

  return {
    stages: shells.map((stage, i) => {
      const status = statuses[i];
      const detail =
        status === "current" && snapshot.verificationMessage
          ? snapshot.verificationMessage
          : stage.detail;
      return { ...stage, status, detail };
    }),
    resumable: false,
  };
}
