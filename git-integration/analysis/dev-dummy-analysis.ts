import type { AIRepoAnalysis } from "./ai-analysis";

/**
 * Dummy AI analysis data returned in dev mode to avoid wasting OpenAI tokens.
 * Set AI_SKIP_DEV=false to use real AI in development.
 */
export const DEV_DUMMY_ANALYSIS: AIRepoAnalysis = {
  runtime: "node",
  runtimeVersion: "22",
  framework: "Express",
  frameworkVersion: "4.x",
  buildCommand: "npm run build",
  startCommand: "npm start",
  port: 3000,
  needsScheduler: false,
  needsQueueWorker: false,
  needsWebsockets: false,
  envVars: ["DATABASE_URL=postgresql://localhost:5432/app", "JWT_SECRET=dev-secret", "PORT=3000"],
  postDeployCommands: ["npm run migrate"],
  nginxConfig: "reverse-proxy",
  summary: "A full-stack TypeScript application with Express backend and React frontend.",
  description: "This project is a modern web application built with TypeScript across the full stack.",
  sections: {
    overview: `## Overview

This is a full-stack web application built with **TypeScript** across the entire stack. The backend uses **Express.js** with a PostgreSQL database, while the frontend is a **React** single-page application bundled with Vite.

### Key Highlights
- **Type-safe** end-to-end with shared TypeScript types
- **RESTful API** with JWT authentication and role-based access control
- **Responsive UI** with Tailwind CSS and dark mode support
- **Database migrations** managed via SQL files with a custom runner

The application follows a microservices-inspired architecture where each domain (auth, users, projects, etc.) is organized as a separate module with its own endpoints and business logic.`,

    howItWorks: `## How It Works

### Request Flow
1. The React frontend makes API calls to the backend via \`fetch\`
2. Requests pass through the auth middleware which validates JWT tokens
3. Each service handler processes the request, interacts with the database, and returns a JSON response
4. The frontend updates its state and re-renders the UI

### Authentication
- Users log in with email/password and receive a JWT token
- The token is stored in localStorage and sent with every request via the \`Authorization\` header
- Two-factor authentication (TOTP) is available as an optional security layer

### Data Flow
- All data is stored in PostgreSQL with parameterized queries (no ORM)
- Session data (analysis cache, stack cache) is stored in the database with TTL-based invalidation
- Frontend caches analysis results in sessionStorage to avoid redundant API calls`,

    techStack: "",

    architecture: `## Architecture

### Backend Services
The backend is organized into independent service modules:

| Service | Responsibility |
|---------|---------------|
| **auth** | Authentication, JWT, 2FA |
| **users** | User CRUD, profile management |
| **roles** | Role-based permissions |
| **projects** | Project management |
| **git-integration** | Git provider connections, repo analysis |
| **code-analysis** | Security scanning, rule management |
| **deploy** | Deployment automation |
| **notifications** | Multi-channel alerting |

### Frontend
- **React 19** with functional components and hooks
- **Vite** for fast development and optimized builds
- **Tailwind CSS v4** for utility-first styling
- **React Router** for client-side navigation

### Database
- Single PostgreSQL instance shared across all services
- 21 tables with SQL migrations (one per table)
- No ORM — raw SQL with parameterized queries via \`pg\` driver`,

    dataStorage: `## Data & Storage

### Database Tables
The application uses **21 PostgreSQL tables** organized by domain:

- **Core:** apps, users, roles, projects
- **Git:** git_connections, analysis_cache, stack_cache, repo_cache, stats_cache, sensitive_cache
- **Security:** scans, findings, custom_rules, semgrep_rules, opengrep_rules
- **Deploy:** server_providers, deployments, builds, ssh_keys
- **Notifications:** notifications, notification_channels

### Caching Strategy
- **Analysis cache:** AI-generated project analysis cached by repo + branch + commit SHA
- **Stack cache:** Tech stack detection results cached by repo + branch
- **Stats cache:** Repository statistics cached with TTL
- **Session storage:** Frontend caches analysis in sessionStorage for instant navigation`,

    codeQuality: `## Code Quality

### Strengths
- **TypeScript everywhere** — strict mode enabled, no \`any\` types in new code
- **Consistent error handling** — \`unknown\` catch types with explicit casting
- **Centralized types** — shared type definitions in \`frontend/src/types/\`
- **Component extraction** — reusable UI components (Spinner, Modal, TechBadge, etc.)

### Patterns
- **Service pattern** — each backend module exports API endpoints via Encore's \`api()\` function
- **Hook pattern** — complex page logic extracted into custom hooks (\`useProjectDetail\`, \`useScanDetail\`)
- **Permission gating** — UI elements conditionally rendered based on user permissions

### Testing
- Unit tests for pure functions (tech stack detection, dependency scanning, badge whitelist)
- API smoke tests covering all 93 endpoints
- Vitest as the test runner`,

    security: `## Security

### Authentication
- **JWT tokens** with 7-day expiry, signed with a configurable secret
- **bcrypt** password hashing with salt rounds
- **TOTP 2FA** support via \`otplib\`
- **Role-based access control** with granular permissions

### API Security
- All endpoints (except login/register) require authentication
- Input validation on all mutation endpoints
- Parameterized SQL queries (no string interpolation)
- CORS configured per environment

### Code Scanning
- **1935 Semgrep rules** covering 20+ languages
- **Custom regex rules** for project-specific patterns
- Scans detect SQL injection, XSS, command injection, weak crypto, and more`,

    deployment: `## Deployment

### Encore Cloud
- Push to deploy via \`encore deploy\`
- Secrets managed via Encore dashboard
- Frontend deployed separately (S3, Vercel, etc.)

### Docker (Self-Hosted)
- Multi-stage Dockerfile with PostgreSQL, Semgrep, and Node.js
- Traefik reverse proxy for routing
- Docker Compose for single-command setup

### Database
- Migrations: \`pnpm db:migrate\`
- Seeders: \`pnpm db:seed\` (includes 1935 Semgrep rules)
- Full reset: \`pnpm db:reset\``,
  },
  deployOptions: [
    {
      provider: "aws",
      type: "ECS Fargate",
      description: "Serverless container hosting on AWS",
      pros: ["Auto-scaling", "No server management", "Pay per use"],
      cons: ["Higher cost at scale", "Cold starts"],
      estimatedMonthlyCost: "$15-50",
      bestFor: "Production workloads with variable traffic",
    },
    {
      provider: "docker",
      type: "Self-hosted VPS",
      description: "Docker Compose on a VPS",
      pros: ["Full control", "Low cost", "Simple setup"],
      cons: ["Manual scaling", "Self-managed updates"],
      estimatedMonthlyCost: "$5-20",
      bestFor: "Small teams and development environments",
    },
  ],
};
