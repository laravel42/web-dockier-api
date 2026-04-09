# Dockier

A full-stack application with EncoreJS backend and React + Tailwind frontend.

## Features

- **Auth**: Register, login, JWT tokens, 2FA (TOTP), Google & GitHub social login
- **Users**: CRUD, search, pagination
- **Groups & Roles**: Group management, role-based permissions, membership
- **Git Integration**: Connect GitHub/GitLab/Bitbucket via personal tokens, browse repos & branches
- **Notifications**: Multi-channel (email, Slack, webhook, in-app), pub/sub processing
- **Deploy**: Server provider management (AWS, GCP, DigitalOcean, Hetzner), automated deployments

## Architecture

```
backend (EncoreJS)
├── auth/           → Authentication, 2FA, social login
├── users/          → User management
├── groups/         → Groups, roles, membership
├── git-integration/→ Git provider connections
├── notifications/  → Multi-channel notifications (pub/sub)
└── deploy/         → Server providers & deployment automation

frontend (React + Tailwind)
├── src/context/    → Auth context
├── src/services/   → API client layer
├── src/components/ → Layout, shared components
└── src/pages/      → All page views
```

## Getting Started

### Prerequisites

- Node.js 18+
- [Encore CLI](https://encore.dev/docs/install)

### Backend

```bash
# Set required secrets
encore secret set JwtSecret --type dev
encore secret set GoogleClientId --type dev
encore secret set GoogleClientSecret --type dev
encore secret set GitHubClientId --type dev
encore secret set GitHubClientSecret --type dev
encore secret set SmtpHost --type dev
encore secret set SmtpPort --type dev
encore secret set SmtpUser --type dev
encore secret set SmtpPass --type dev
encore secret set SlackWebhookUrl --type dev

# Run the backend
encore run
```

The backend runs on `http://localhost:4000` with Encore's dashboard at `http://localhost:9400`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies API calls to the backend.

## API Endpoints

| Service       | Method | Path                                          | Auth |
|---------------|--------|-----------------------------------------------|------|
| Auth          | POST   | /auth/register                                | No   |
| Auth          | POST   | /auth/login                                   | No   |
| Auth          | POST   | /auth/social                                  | No   |
| Auth          | POST   | /auth/2fa/setup                               | Yes  |
| Auth          | POST   | /auth/2fa/enable                              | Yes  |
| Auth          | POST   | /auth/2fa/verify                              | No   |
| Users         | GET    | /users                                        | Yes  |
| Users         | GET    | /users/:userId                                | Yes  |
| Users         | PUT    | /users/:userId                                | Yes  |
| Users         | DELETE | /users/:userId                                | Yes  |
| Groups        | GET    | /groups                                       | Yes  |
| Groups        | POST   | /groups                                       | Yes  |
| Groups        | GET    | /groups/:groupId                              | Yes  |
| Groups        | PUT    | /groups/:groupId                              | Yes  |
| Groups        | DELETE | /groups/:groupId                              | Yes  |
| Groups        | POST   | /groups/:groupId/members                      | Yes  |
| Groups        | GET    | /groups/:groupId/members                      | Yes  |
| Groups        | DELETE | /groups/:groupId/members/:userId              | Yes  |
| Roles         | GET    | /roles                                        | Yes  |
| Roles         | POST   | /roles                                        | Yes  |
| Roles         | DELETE | /roles/:roleId                                | Yes  |
| Git           | GET    | /git/connections                              | Yes  |
| Git           | POST   | /git/connections                              | Yes  |
| Git           | DELETE | /git/connections/:connectionId                | Yes  |
| Git           | GET    | /git/connections/:connectionId/repos          | Yes  |
| Git           | GET    | /git/connections/:id/repos/:owner/:repo/branches | Yes |
| Notifications | GET    | /notifications                                | Yes  |
| Notifications | GET    | /notifications/channels                       | Yes  |
| Notifications | POST   | /notifications/channels                       | Yes  |
| Notifications | PUT    | /notifications/channels/:channelId/toggle     | Yes  |
| Notifications | DELETE | /notifications/channels/:channelId            | Yes  |
| Notifications | POST   | /notifications/send                           | Yes  |
| Notifications | PUT    | /notifications/:notificationId/read           | Yes  |
| Deploy        | GET    | /deploy/providers                             | Yes  |
| Deploy        | POST   | /deploy/providers                             | Yes  |
| Deploy        | DELETE | /deploy/providers/:providerId                 | Yes  |
| Deploy        | GET    | /deploy/deployments                           | Yes  |
| Deploy        | POST   | /deploy/deployments                           | Yes  |
| Deploy        | GET    | /deploy/deployments/:deploymentId             | Yes  |
