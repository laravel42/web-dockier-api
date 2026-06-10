export interface PMIntegration {
  id: string;
  type: string;
  name: string;
  config?: Record<string, string>;
  enabled: boolean;
  createdAt?: string;
}

export interface PMTeam {
  id: string;
  name: string;
  key?: string;
}

export interface PMMember {
  id: string;
  name: string;
  email?: string;
}
