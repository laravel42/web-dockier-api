// Integration catalog inspired by Activepieces connectors (https://github.com/activepieces/activepieces)
// Categories and pieces sourced from the Activepieces open-source ecosystem

export interface IntegrationDef {
  type: string;
  name: string;
  category: string;
  description: string;
  fields: Array<{ key: string; label: string; placeholder: string; secret?: boolean; options?: "dynamic" | Array<{ value: string; label: string }> }>;
}

export const INTEGRATION_CATALOG: IntegrationDef[] = [
  // ── Databases ──
  { type: "postgresql", name: "PostgreSQL", category: "Database", description: "The world's most advanced open-source relational database", fields: [{ key: "host", label: "Host", placeholder: "db.example.com" }, { key: "port", label: "Port", placeholder: "5432" }, { key: "database", label: "Database", placeholder: "myapp" }, { key: "username", label: "Username", placeholder: "postgres" }, { key: "password", label: "Password", placeholder: "••••••", secret: true }] },
  { type: "mysql", name: "MySQL", category: "Database", description: "The world's most popular open-source database", fields: [{ key: "host", label: "Host", placeholder: "db.example.com" }, { key: "port", label: "Port", placeholder: "3306" }, { key: "database", label: "Database", placeholder: "myapp" }, { key: "username", label: "Username", placeholder: "root" }, { key: "password", label: "Password", placeholder: "••••••", secret: true }] },
  { type: "mongodb", name: "MongoDB", category: "Database", description: "NoSQL document database for modern applications", fields: [{ key: "connectionString", label: "Connection String", placeholder: "mongodb+srv://user:pass@cluster.mongodb.net/db", secret: true }] },
  { type: "supabase", name: "Supabase", category: "Database", description: "The open-source Firebase alternative", fields: [{ key: "url", label: "Project URL", placeholder: "https://xxx.supabase.co" }, { key: "apiKey", label: "API Key", placeholder: "eyJ...", secret: true }] },
  { type: "nocodb", name: "NocoDB", category: "Database", description: "Open-source online database tool, alternative to Airtable", fields: [{ key: "url", label: "NocoDB URL", placeholder: "https://nocodb.example.com" }, { key: "apiToken", label: "API Token", placeholder: "••••••", secret: true }] },
  { type: "pocketbase", name: "PocketBase", category: "Database", description: "Interact with your PocketBase instance using superuser credentials", fields: [{ key: "url", label: "PocketBase URL", placeholder: "https://pb.example.com" }, { key: "email", label: "Admin Email", placeholder: "admin@example.com" }, { key: "password", label: "Admin Password", placeholder: "••••••", secret: true }] },
  // ── Cloud Storage ──
  { type: "s3", name: "Amazon S3", category: "Storage", description: "Scalable storage in the cloud", fields: [{ key: "region", label: "Region", placeholder: "us-east-1" }, { key: "bucket", label: "Bucket", placeholder: "my-bucket" }, { key: "accessKey", label: "Access Key", placeholder: "AKIA..." }, { key: "secretKey", label: "Secret Key", placeholder: "••••••", secret: true }] },
  { type: "google-cloud-storage", name: "Google Cloud Storage", category: "Storage", description: "Automate file storage operations with Google Cloud Storage", fields: [{ key: "projectId", label: "Project ID", placeholder: "my-project" }, { key: "bucket", label: "Bucket", placeholder: "my-bucket" }, { key: "serviceAccountKey", label: "Service Account Key (JSON)", placeholder: '{"type":"service_account"...}', secret: true }] },
  { type: "dropbox", name: "Dropbox", category: "Storage", description: "Cloud storage and file backup", fields: [{ key: "accessToken", label: "Access Token", placeholder: "sl.••••••", secret: true }] },
  { type: "onedrive", name: "Microsoft OneDrive", category: "Storage", description: "Cloud storage by Microsoft", fields: [{ key: "clientId", label: "Client ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx" }, { key: "clientSecret", label: "Client Secret", placeholder: "••••••", secret: true }, { key: "tenantId", label: "Tenant ID", placeholder: "common" }] },
  { type: "azure-blob", name: "Azure Blob Storage", category: "Storage", description: "Scalable object storage from Microsoft Azure", fields: [{ key: "connectionString", label: "Connection String", placeholder: "DefaultEndpointsProtocol=https;AccountName=...", secret: true }] },

  // ── Cache & Key-Value ──
  { type: "redis", name: "Redis", category: "Cache", description: "In-memory data store for caching and sessions", fields: [{ key: "host", label: "Host", placeholder: "redis.example.com" }, { key: "port", label: "Port", placeholder: "6379" }, { key: "password", label: "Password", placeholder: "••••••", secret: true }] },

  // ── Messaging & Queues ──
  { type: "rabbitmq", name: "RabbitMQ", category: "Queue", description: "Managed RabbitMQ message broker", fields: [{ key: "host", label: "Host", placeholder: "rabbit.example.com" }, { key: "port", label: "Port", placeholder: "5672" }, { key: "username", label: "Username", placeholder: "guest" }, { key: "password", label: "Password", placeholder: "••••••", secret: true }, { key: "vhost", label: "Virtual Host", placeholder: "/" }] },
  { type: "google-pubsub", name: "Google Pub/Sub", category: "Queue", description: "Google Cloud's event streaming service", fields: [{ key: "projectId", label: "Project ID", placeholder: "my-project" }, { key: "serviceAccountKey", label: "Service Account Key (JSON)", placeholder: '{"type":"service_account"...}', secret: true }] },

  // ── Email & Mail ──
  { type: "smtp", name: "SMTP", category: "Mail", description: "Send emails using Simple Mail Transfer Protocol", fields: [{ key: "host", label: "SMTP Host", placeholder: "smtp.mailgun.org" }, { key: "port", label: "Port", placeholder: "587" }, { key: "username", label: "Username", placeholder: "postmaster@example.com" }, { key: "password", label: "Password", placeholder: "••••••", secret: true }, { key: "fromAddress", label: "From Address", placeholder: "noreply@example.com" }] },
  { type: "sendgrid", name: "SendGrid", category: "Mail", description: "Email delivery service for sending transactional and marketing emails", fields: [{ key: "apiKey", label: "API Key", placeholder: "SG.••••••", secret: true }, { key: "fromEmail", label: "From Email", placeholder: "noreply@example.com" }] },
  { type: "mailchimp", name: "Mailchimp", category: "Mail", description: "All-in-One integrated marketing platform", fields: [{ key: "apiKey", label: "API Key", placeholder: "xxxxxxxx-us1", secret: true }] },
  { type: "brevo", name: "Brevo (Sendinblue)", category: "Mail", description: "SaaS solution for relationship marketing", fields: [{ key: "apiKey", label: "API Key", placeholder: "xkeysib-••••••", secret: true }] },
  { type: "postmark", name: "Postmark", category: "Mail", description: "Email delivery service for transactional emails", fields: [{ key: "serverToken", label: "Server Token", placeholder: "xxxxxxxx-xxxx-xxxx", secret: true }, { key: "fromEmail", label: "From Email", placeholder: "noreply@example.com" }] },
  { type: "convertkit", name: "ConvertKit", category: "Mail", description: "Email marketing for creators", fields: [{ key: "apiKey", label: "API Key", placeholder: "••••••", secret: true }, { key: "apiSecret", label: "API Secret", placeholder: "••••••", secret: true }] },

  // ── Communication ──
  { type: "slack", name: "Slack", category: "Communication", description: "Channel-based messaging platform", fields: [{ key: "botToken", label: "Bot Token", placeholder: "xoxb-••••••", secret: true }] },
  { type: "discord", name: "Discord", category: "Communication", description: "Instant messaging and VoIP social platform", fields: [{ key: "botToken", label: "Bot Token", placeholder: "••••••", secret: true }] },
  { type: "telegram", name: "Telegram Bot", category: "Communication", description: "Build chatbots for Telegram", fields: [{ key: "botToken", label: "Bot Token", placeholder: "123456:ABC-DEF...", secret: true }] },
  { type: "mattermost", name: "Mattermost", category: "Communication", description: "Open-source, self-hosted Slack alternative", fields: [{ key: "url", label: "Server URL", placeholder: "https://mattermost.example.com" }, { key: "token", label: "Personal Access Token", placeholder: "••••••", secret: true }] },
  { type: "matrix", name: "Matrix", category: "Communication", description: "Open standard for decentralized real-time communication", fields: [{ key: "homeserver", label: "Homeserver URL", placeholder: "https://matrix.org" }, { key: "accessToken", label: "Access Token", placeholder: "••••••", secret: true }] },
  { type: "twilio", name: "Twilio", category: "Communication", description: "Cloud communications platform for SMS, Voice & Messaging", fields: [{ key: "accountSid", label: "Account SID", placeholder: "ACxxxxxxxx" }, { key: "authToken", label: "Auth Token", placeholder: "••••••", secret: true }, { key: "fromNumber", label: "From Number", placeholder: "+1234567890" }] },
  { type: "pusher", name: "Pusher", category: "Communication", description: "WebSocket broadcasting service for real-time features", fields: [{ key: "appId", label: "App ID", placeholder: "123456" }, { key: "key", label: "Key", placeholder: "abc123" }, { key: "secret", label: "Secret", placeholder: "••••••", secret: true }, { key: "cluster", label: "Cluster", placeholder: "eu" }] },
  { type: "intercom", name: "Intercom", category: "Communication", description: "Customer messaging platform for sales, marketing, and support", fields: [{ key: "accessToken", label: "Access Token", placeholder: "dG9rOg==...", secret: true }] },

  // ── CRM & Sales ──
  { type: "salesforce", name: "Salesforce", category: "CRM", description: "CRM software solutions and enterprise cloud computing", fields: [{ key: "instanceUrl", label: "Instance URL", placeholder: "https://myorg.salesforce.com" }, { key: "clientId", label: "Client ID", placeholder: "3MVG9..." }, { key: "clientSecret", label: "Client Secret", placeholder: "••••••", secret: true }] },
  { type: "hubspot", name: "HubSpot", category: "CRM", description: "Powerful CRM for sales, customer service, and marketing automation", fields: [{ key: "accessToken", label: "Private App Token", placeholder: "pat-na1-••••••", secret: true }] },
  { type: "pipedrive", name: "Pipedrive", category: "CRM", description: "Sales CRM and pipeline management software", fields: [{ key: "apiToken", label: "API Token", placeholder: "••••••", secret: true }, { key: "domain", label: "Company Domain", placeholder: "mycompany" }] },
  { type: "zoho-crm", name: "Zoho CRM", category: "CRM", description: "Customer relationship management software", fields: [{ key: "clientId", label: "Client ID", placeholder: "1000.XXXX" }, { key: "clientSecret", label: "Client Secret", placeholder: "••••••", secret: true }, { key: "refreshToken", label: "Refresh Token", placeholder: "1000.XXXX", secret: true }] },
  { type: "freshsales", name: "Freshsales", category: "CRM", description: "Sales CRM for pipeline management and lead tracking", fields: [{ key: "domain", label: "Domain", placeholder: "mycompany.freshsales.io" }, { key: "apiKey", label: "API Key", placeholder: "••••••", secret: true }] },

  // ── Project Management ──
  { type: "jira", name: "Jira", category: "Project Management", description: "Issue tracking and project management", fields: [{ key: "host", label: "Jira URL", placeholder: "https://myorg.atlassian.net" }, { key: "email", label: "Email", placeholder: "user@example.com" }, { key: "apiToken", label: "API Token", placeholder: "••••••", secret: true }] },
  { type: "linear", name: "Linear", category: "Project Management", description: "Issue tracking for modern software teams", fields: [{ key: "apiKey", label: "API Key", placeholder: "lin_api_••••••", secret: true }] },
  { type: "asana", name: "Asana", category: "Project Management", description: "Work management platform for teams", fields: [{ key: "accessToken", label: "Personal Access Token", placeholder: "1/••••••", secret: true }] },
  { type: "monday", name: "Monday.com", category: "Project Management", description: "Work operating system for businesses", fields: [{ key: "apiToken", label: "API Token", placeholder: "eyJ...", secret: true }] },
  { type: "clickup", name: "ClickUp", category: "Project Management", description: "All-in-one productivity platform", fields: [{ key: "apiKey", label: "API Key", placeholder: "pk_••••••", secret: true }] },
  { type: "notion", name: "Notion", category: "Project Management", description: "Collaborative workspace platform", fields: [{ key: "apiKey", label: "Integration Token", placeholder: "secret_••••••", secret: true }] },
  { type: "todoist", name: "Todoist", category: "Project Management", description: "To-do list and task manager", fields: [{ key: "apiToken", label: "API Token", placeholder: "••••••", secret: true }] },
  { type: "basecamp", name: "Basecamp", category: "Project Management", description: "Project management made simple", fields: [{ key: "accountId", label: "Account ID", placeholder: "1234567" }, { key: "accessToken", label: "Access Token", placeholder: "••••••", secret: true }] },

  // ── Payments ──
  { type: "stripe", name: "Stripe", category: "Payments", description: "Online payment processing for internet businesses", fields: [{ key: "secretKey", label: "Secret Key", placeholder: "sk_live_••••••", secret: true }] },
  { type: "paypal", name: "PayPal", category: "Payments", description: "Payment solutions for every business", fields: [{ key: "clientId", label: "Client ID", placeholder: "AXxx..." }, { key: "clientSecret", label: "Client Secret", placeholder: "••••••", secret: true }, { key: "sandbox", label: "Sandbox Mode", placeholder: "false" }] },
  { type: "lemonsqueezy", name: "Lemon Squeezy", category: "Payments", description: "Payment gateway for e-commerce and subscriptions", fields: [{ key: "apiKey", label: "API Key", placeholder: "••••••", secret: true }] },

  // ── DevOps & CI/CD ──
  { type: "github", name: "GitHub", category: "DevOps", description: "Collaboration tool for developers", fields: [{ key: "token", label: "Personal Access Token", placeholder: "ghp_••••••", secret: true }] },
  { type: "gitlab", name: "GitLab", category: "DevOps", description: "Developer platform for code, CI/CD, and DevSecOps", fields: [{ key: "host", label: "GitLab URL", placeholder: "https://gitlab.com" }, { key: "token", label: "Personal Access Token", placeholder: "glpat-••••••", secret: true }] },
  { type: "vercel", name: "Vercel", category: "DevOps", description: "Deploy projects and manage environment variables", fields: [{ key: "token", label: "API Token", placeholder: "••••••", secret: true }] },
  { type: "netlify", name: "Netlify", category: "DevOps", description: "Platform for building and deploying websites and apps", fields: [{ key: "token", label: "Personal Access Token", placeholder: "••••••", secret: true }] },
  { type: "docker", name: "Docker Hub", category: "DevOps", description: "Container registry for Docker images", fields: [{ key: "username", label: "Username", placeholder: "myuser" }, { key: "password", label: "Access Token", placeholder: "dckr_pat_••••••", secret: true }] },


];

const categoryBadgeBase =
  "inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium shrink-0";

/** Dark-mode-friendly tone badges for integration catalog categories. */
export const CATEGORY_COLORS: Record<string, string> = {
  Database: `${categoryBadgeBase} border-amber-500/45 bg-amber-500/30 text-amber-300`,
  Storage: `${categoryBadgeBase} border-blue-500/45 bg-blue-500/30 text-blue-300`,
  Cache: `${categoryBadgeBase} border-red-500/45 bg-red-500/30 text-red-300`,
  Queue: `${categoryBadgeBase} border-purple-500/45 bg-purple-500/30 text-purple-300`,
  Mail: `${categoryBadgeBase} border-green-500/45 bg-green-500/30 text-green-300`,
  Communication: `${categoryBadgeBase} border-indigo-500/45 bg-indigo-500/30 text-indigo-300`,
  CRM: `${categoryBadgeBase} border-orange-500/45 bg-orange-500/30 text-orange-300`,
  "Project Management": `${categoryBadgeBase} border-violet-500/45 bg-violet-500/30 text-violet-300`,
  Payments: `${categoryBadgeBase} border-emerald-500/45 bg-emerald-500/30 text-emerald-300`,
  DevOps: `${categoryBadgeBase} border-slate-500/45 bg-slate-500/30 text-slate-300`,
};

export function categoryBadgeCls(category: string): string {
  return (
    CATEGORY_COLORS[category] ??
    `${categoryBadgeBase} border-border/60 bg-secondary-50/30 text-text-muted`
  );
}
