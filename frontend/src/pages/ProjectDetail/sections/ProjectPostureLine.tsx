import { Link } from "react-router-dom";
import type { Deployment, Project } from "@/types";
import type { Scan } from "@/types/scan";
import {
  TONE_CLASS,
  deployClause,
  findingsClause,
  infraClause,
  type Clause,
} from "../postureClauses";

/**
 * Three clauses beneath the project title: what shipped, what is wrong, what is
 * running. The rules live in postureClauses.ts; this renders them.
 */
interface Props {
  project: Project;
  recentDeploys: readonly Deployment[];
  recentScans: readonly Scan[];
  deploysError?: string;
  scansError?: string;
  deploysLoaded?: boolean;
  scansLoaded?: boolean;
}

export default function ProjectPostureLine({
  project,
  recentDeploys,
  recentScans,
  deploysError = "",
  scansError = "",
  deploysLoaded = false,
  scansLoaded = false,
}: Props) {
  const clauses = [
    deployClause(recentDeploys, deploysError, deploysLoaded),
    findingsClause(recentScans, scansError, scansLoaded),
    infraClause(project, recentDeploys),
  ].filter((c): c is Clause => c !== null);

  if (clauses.length === 0) return null;

  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {clauses.map((clause, i) => (
        <span key={clause.tab} className="flex items-center gap-x-2">
          {i > 0 && <span aria-hidden="true" className="text-text-muted/50">·</span>}
          <Link
            to={`?tab=${clause.tab}`}
            className={`${TONE_CLASS[clause.tone]} rounded-sm underline decoration-transparent underline-offset-2 transition-colors hover:decoration-current`}
          >
            {clause.text}
          </Link>
        </span>
      ))}
    </p>
  );
}
