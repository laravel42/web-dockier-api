export const strategyLabels: Record<string, string> = {
  vps: "VPS",
  managed: "ECS Fargate",
};

export const statusColors: Record<string, string> = {
  success: "bg-success-500/10 text-success-500",
  failed: "bg-danger-500/10 text-danger-500",
  building: "bg-warning-500/10 text-warning-500",
  deploying: "bg-primary-500/10 text-primary-500",
  pending: "bg-secondary-100 text-text-muted",
  destroyed: "bg-secondary-100 text-text-muted",
};
