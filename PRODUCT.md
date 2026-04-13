# Dockier

Dockier is a developer platform that connects your source code repositories to automated security scanning, deployment pipelines, and project management — all from a single dashboard.

## What It Does

Dockier brings together the tools developers need to ship secure code faster:

- **Project Management** — Connect GitHub, GitLab, or Bitbucket repositories and organize them as projects with branch tracking, tech stack detection, and deployment status at a glance.

- **Security Scanning** — Run automated code analysis powered by Opengrep, SonarQube, and a built-in custom rules engine. Scans detect SQL injection, XSS, command injection, weak cryptography, path traversal, and dozens of other vulnerability classes across PHP, JavaScript, TypeScript, Python, Go, Java, Ruby, and more.

- **AI-Assisted Remediation** — Generate fix merge requests directly from scan findings using LLM-powered code suggestions. Assign reviewers and track fixes without leaving the platform.

- **Issue Tracking Integration** — Create issues in Jira, Linear, or other project management tools directly from security findings, with AI-generated titles, severity-based priority mapping, and effort estimates.

- **Deployment Automation** — Configure server providers (AWS, GCP, DigitalOcean, Hetzner) and trigger deployments tied to specific branches and commits. Track deployment history per project.

- **Notifications** — Multi-channel alerting via email, Slack, webhooks, and in-app notifications for scan results, deployments, and other events.

- **Authentication & Access Control** — User registration, JWT-based auth, two-factor authentication (TOTP), social login (GitHub, GitLab, Bitbucket), and role-based permissions with group management.

## Architecture

Dockier is built as a set of microservices using [Encore.ts](https://encore.dev) on the backend and React with Tailwind CSS on the frontend.

**Backend services:** Auth, Users, Groups, Roles, Projects, Git Integration, Code Analysis, Notifications, Deploy, Image Builder, and Integrations.

**Frontend:** Single-page React app with pages for Projects, Security Scans, Settings (providers, SSH keys, source control, integrations, security rules), and more.

## License

MPL-2.0
