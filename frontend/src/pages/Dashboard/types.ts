export type { Project } from "../../types";
export type { Deployment as Deploy } from "../../types";
export type { Provider } from "../../types";

// Dashboard uses a lighter Scan shape (no full ScanSummary with filesScanned etc.)
// Keep the alias for backward compat but use the shared base
export type { Scan } from "../../types";
