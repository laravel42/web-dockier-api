// Integration catalog inspired by Activepieces connectors (https://github.com/activepieces/activepieces)
// Categories and pieces sourced from the Activepieces open-source ecosystem

export interface IntegrationDef {
  type: string;
  name: string;
  category: string;
  description: string;
  fields: Array<{ key: string; label: string; placeholder: string; secret?: boolean }>;
  logoUrl?: string;
}

export const INTEGRATION_CATALOG: IntegrationDef[] = [
  // ── Databases ──
  { type: "postgresql", name: "PostgreSQL", category: "Database", description: "The world's most advanced open-source relational database", fields: [{ key: "host", label: "Host", placeholder: "db.example.com" }, { key: "port", label: "Port", placeholder: "5432" }, { key: "database", label: "Database", placeholder: "myapp" }, { key: "username", label: "Username", placeholder: "postgres" }, { key: "password", label: "Password", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/postgresql" },
  { type: "mysql", name: "MySQL", category: "Database", description: "The world's most popular open-source database", fields: [{ key: "host", label: "Host", placeholder: "db.example.com" }, { key: "port", label: "Port", placeholder: "3306" }, { key: "database", label: "Database", placeholder: "myapp" }, { key: "username", label: "Username", placeholder: "root" }, { key: "password", label: "Password", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/mysql" },
  { type: "mongodb", name: "MongoDB", category: "Database", description: "NoSQL document database for modern applications", fields: [{ key: "connectionString", label: "Connection String", placeholder: "mongodb+srv://user:pass@cluster.mongodb.net/db", secret: true }], logoUrl: "https://cdn.simpleicons.org/mongodb" },
  { type: "supabase", name: "Supabase", category: "Database", description: "The open-source Firebase alternative", fields: [{ key: "url", label: "Project URL", placeholder: "https://xxx.supabase.co" }, { key: "apiKey", label: "API Key", placeholder: "eyJ...", secret: true }], logoUrl: "https://cdn.simpleicons.org/supabase" },
  { type: "nocodb", name: "NocoDB", category: "Database", description: "Open-source online database tool, alternative to Airtable", fields: [{ key: "url", label: "NocoDB URL", placeholder: "https://nocodb.example.com" }, { key: "apiToken", label: "API Token", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/nocodb" },
  { type: "pocketbase", name: "PocketBase", category: "Database", description: "Interact with your PocketBase instance using superuser credentials", fields: [{ key: "url", label: "PocketBase URL", placeholder: "https://pb.example.com" }, { key: "email", label: "Admin Email", placeholder: "admin@example.com" }, { key: "password", label: "Admin Password", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/pocketbase" },
  // ── Cloud Storage ──
  { type: "s3", name: "Amazon S3", category: "Storage", description: "Scalable storage in the cloud", fields: [{ key: "region", label: "Region", placeholder: "us-east-1" }, { key: "bucket", label: "Bucket", placeholder: "my-bucket" }, { key: "accessKey", label: "Access Key", placeholder: "AKIA..." }, { key: "secretKey", label: "Secret Key", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/amazons3" },
  { type: "google-cloud-storage", name: "Google Cloud Storage", category: "Storage", description: "Automate file storage operations with Google Cloud Storage", fields: [{ key: "projectId", label: "Project ID", placeholder: "my-project" }, { key: "bucket", label: "Bucket", placeholder: "my-bucket" }, { key: "serviceAccountKey", label: "Service Account Key (JSON)", placeholder: '{"type":"service_account"...}', secret: true }], logoUrl: "https://cdn.simpleicons.org/googlecloud" },
  { type: "dropbox", name: "Dropbox", category: "Storage", description: "Cloud storage and file backup", fields: [{ key: "accessToken", label: "Access Token", placeholder: "sl.••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/dropbox" },
  { type: "onedrive", name: "Microsoft OneDrive", category: "Storage", description: "Cloud storage by Microsoft", fields: [{ key: "clientId", label: "Client ID", placeholder: "xxxxxxxx-xxxx-xxxx-xxxx" }, { key: "clientSecret", label: "Client Secret", placeholder: "••••••", secret: true }, { key: "tenantId", label: "Tenant ID", placeholder: "common" }], logoUrl: "https://cdn.simpleicons.org/microsoftonedrive" },
  { type: "azure-blob", name: "Azure Blob Storage", category: "Storage", description: "Scalable object storage from Microsoft Azure", fields: [{ key: "connectionString", label: "Connection String", placeholder: "DefaultEndpointsProtocol=https;AccountName=...", secret: true }], logoUrl: "https://cdn.simpleicons.org/microsoftazure" },

  // ── Cache & Key-Value ──
  { type: "redis", name: "Redis", category: "Cache", description: "In-memory data store for caching and sessions", fields: [{ key: "host", label: "Host", placeholder: "redis.example.com" }, { key: "port", label: "Port", placeholder: "6379" }, { key: "password", label: "Password", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/redis" },

  // ── Messaging & Queues ──
  { type: "rabbitmq", name: "RabbitMQ", category: "Queue", description: "Managed RabbitMQ message broker", fields: [{ key: "host", label: "Host", placeholder: "rabbit.example.com" }, { key: "port", label: "Port", placeholder: "5672" }, { key: "username", label: "Username", placeholder: "guest" }, { key: "password", label: "Password", placeholder: "••••••", secret: true }, { key: "vhost", label: "Virtual Host", placeholder: "/" }], logoUrl: "https://cdn.simpleicons.org/rabbitmq" },
  { type: "google-pubsub", name: "Google Pub/Sub", category: "Queue", description: "Google Cloud's event streaming service", fields: [{ key: "projectId", label: "Project ID", placeholder: "my-project" }, { key: "serviceAccountKey", label: "Service Account Key (JSON)", placeholder: '{"type":"service_account"...}', secret: true }], logoUrl: "https://cdn.simpleicons.org/googlepubsub" },

  // ── Email & Mail ──
  { type: "smtp", name: "SMTP", category: "Mail", description: "Send emails using Simple Mail Transfer Protocol", fields: [{ key: "host", label: "SMTP Host", placeholder: "smtp.mailgun.org" }, { key: "port", label: "Port", placeholder: "587" }, { key: "username", label: "Username", placeholder: "postmaster@example.com" }, { key: "password", label: "Password", placeholder: "••••••", secret: true }, { key: "fromAddress", label: "From Address", placeholder: "noreply@example.com" }], logoUrl: "https://cdn.simpleicons.org/maildotru" },
  { type: "sendgrid", name: "SendGrid", category: "Mail", description: "Email delivery service for sending transactional and marketing emails", fields: [{ key: "apiKey", label: "API Key", placeholder: "SG.••••••", secret: true }, { key: "fromEmail", label: "From Email", placeholder: "noreply@example.com" }], logoUrl: "https://cdn.simpleicons.org/sendgrid" },
  { type: "mailchimp", name: "Mailchimp", category: "Mail", description: "All-in-One integrated marketing platform", fields: [{ key: "apiKey", label: "API Key", placeholder: "xxxxxxxx-us1", secret: true }], logoUrl: "https://cdn.simpleicons.org/mailchimp" },
  { type: "brevo", name: "Brevo (Sendinblue)", category: "Mail", description: "SaaS solution for relationship marketing", fields: [{ key: "apiKey", label: "API Key", placeholder: "xkeysib-••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/brevo" },
  { type: "postmark", name: "Postmark", category: "Mail", description: "Email delivery service for transactional emails", fields: [{ key: "serverToken", label: "Server Token", placeholder: "xxxxxxxx-xxxx-xxxx", secret: true }, { key: "fromEmail", label: "From Email", placeholder: "noreply@example.com" }] },
  { type: "convertkit", name: "ConvertKit", category: "Mail", description: "Email marketing for creators", fields: [{ key: "apiKey", label: "API Key", placeholder: "••••••", secret: true }, { key: "apiSecret", label: "API Secret", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/convertkit" },

  // ── Communication ──
  { type: "slack", name: "Slack", category: "Communication", description: "Channel-based messaging platform", fields: [{ key: "botToken", label: "Bot Token", placeholder: "xoxb-••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/slack" },
  { type: "discord", name: "Discord", category: "Communication", description: "Instant messaging and VoIP social platform", fields: [{ key: "botToken", label: "Bot Token", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/discord" },
  { type: "telegram", name: "Telegram Bot", category: "Communication", description: "Build chatbots for Telegram", fields: [{ key: "botToken", label: "Bot Token", placeholder: "123456:ABC-DEF...", secret: true }], logoUrl: "https://cdn.simpleicons.org/telegram" },
  { type: "mattermost", name: "Mattermost", category: "Communication", description: "Open-source, self-hosted Slack alternative", fields: [{ key: "url", label: "Server URL", placeholder: "https://mattermost.example.com" }, { key: "token", label: "Personal Access Token", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/mattermost" },
  { type: "matrix", name: "Matrix", category: "Communication", description: "Open standard for decentralized real-time communication", fields: [{ key: "homeserver", label: "Homeserver URL", placeholder: "https://matrix.org" }, { key: "accessToken", label: "Access Token", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/matrix" },
  { type: "twilio", name: "Twilio", category: "Communication", description: "Cloud communications platform for SMS, Voice & Messaging", fields: [{ key: "accountSid", label: "Account SID", placeholder: "ACxxxxxxxx" }, { key: "authToken", label: "Auth Token", placeholder: "••••••", secret: true }, { key: "fromNumber", label: "From Number", placeholder: "+1234567890" }], logoUrl: "https://cdn.simpleicons.org/twilio" },
  { type: "pusher", name: "Pusher", category: "Communication", description: "WebSocket broadcasting service for real-time features", fields: [{ key: "appId", label: "App ID", placeholder: "123456" }, { key: "key", label: "Key", placeholder: "abc123" }, { key: "secret", label: "Secret", placeholder: "••••••", secret: true }, { key: "cluster", label: "Cluster", placeholder: "eu" }], logoUrl: "https://cdn.simpleicons.org/pusher" },
  { type: "intercom", name: "Intercom", category: "Communication", description: "Customer messaging platform for sales, marketing, and support", fields: [{ key: "accessToken", label: "Access Token", placeholder: "dG9rOg==...", secret: true }], logoUrl: "https://cdn.simpleicons.org/intercom" },

  // ── CRM & Sales ──
  { type: "salesforce", name: "Salesforce", category: "CRM", description: "CRM software solutions and enterprise cloud computing", fields: [{ key: "instanceUrl", label: "Instance URL", placeholder: "https://myorg.salesforce.com" }, { key: "clientId", label: "Client ID", placeholder: "3MVG9..." }, { key: "clientSecret", label: "Client Secret", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/salesforce" },
  { type: "hubspot", name: "HubSpot", category: "CRM", description: "Powerful CRM for sales, customer service, and marketing automation", fields: [{ key: "accessToken", label: "Private App Token", placeholder: "pat-na1-••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/hubspot" },
  { type: "pipedrive", name: "Pipedrive", category: "CRM", description: "Sales CRM and pipeline management software", fields: [{ key: "apiToken", label: "API Token", placeholder: "••••••", secret: true }, { key: "domain", label: "Company Domain", placeholder: "mycompany" }], logoUrl: "https://cdn.simpleicons.org/pipedrive" },
  { type: "zoho-crm", name: "Zoho CRM", category: "CRM", description: "Customer relationship management software", fields: [{ key: "clientId", label: "Client ID", placeholder: "1000.XXXX" }, { key: "clientSecret", label: "Client Secret", placeholder: "••••••", secret: true }, { key: "refreshToken", label: "Refresh Token", placeholder: "1000.XXXX", secret: true }], logoUrl: "https://cdn.simpleicons.org/zoho" },
  { type: "freshsales", name: "Freshsales", category: "CRM", description: "Sales CRM for pipeline management and lead tracking", fields: [{ key: "domain", label: "Domain", placeholder: "mycompany.freshsales.io" }, { key: "apiKey", label: "API Key", placeholder: "••••••", secret: true }] },

  // ── Project Management ──
  { type: "jira", name: "Jira", category: "Project Management", description: "Issue tracking and project management", fields: [{ key: "host", label: "Jira URL", placeholder: "https://myorg.atlassian.net" }, { key: "email", label: "Email", placeholder: "user@example.com" }, { key: "apiToken", label: "API Token", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/jira" },
  { type: "linear", name: "Linear", category: "Project Management", description: "Issue tracking for modern software teams", fields: [{ key: "apiKey", label: "API Key", placeholder: "lin_api_••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/linear" },
  { type: "asana", name: "Asana", category: "Project Management", description: "Work management platform for teams", fields: [{ key: "accessToken", label: "Personal Access Token", placeholder: "1/••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/asana" },
  { type: "monday", name: "Monday.com", category: "Project Management", description: "Work operating system for businesses", fields: [{ key: "apiToken", label: "API Token", placeholder: "eyJ...", secret: true }], logoUrl: "https://cdn.simpleicons.org/mondaydotcom" },
  { type: "clickup", name: "ClickUp", category: "Project Management", description: "All-in-one productivity platform", fields: [{ key: "apiKey", label: "API Key", placeholder: "pk_••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/clickup" },
  { type: "notion", name: "Notion", category: "Project Management", description: "Collaborative workspace platform", fields: [{ key: "apiKey", label: "Integration Token", placeholder: "secret_••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/notion" },
  { type: "todoist", name: "Todoist", category: "Project Management", description: "To-do list and task manager", fields: [{ key: "apiToken", label: "API Token", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/todoist" },
  { type: "basecamp", name: "Basecamp", category: "Project Management", description: "Project management made simple", fields: [{ key: "accountId", label: "Account ID", placeholder: "1234567" }, { key: "accessToken", label: "Access Token", placeholder: "••••••", secret: true }] },

  // ── Payments ──
  { type: "stripe", name: "Stripe", category: "Payments", description: "Online payment processing for internet businesses", fields: [{ key: "secretKey", label: "Secret Key", placeholder: "sk_live_••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/stripe" },
  { type: "paypal", name: "PayPal", category: "Payments", description: "Payment solutions for every business", fields: [{ key: "clientId", label: "Client ID", placeholder: "AXxx..." }, { key: "clientSecret", label: "Client Secret", placeholder: "••••••", secret: true }, { key: "sandbox", label: "Sandbox Mode", placeholder: "false" }], logoUrl: "https://cdn.simpleicons.org/paypal" },
  { type: "lemonsqueezy", name: "Lemon Squeezy", category: "Payments", description: "Payment gateway for e-commerce and subscriptions", fields: [{ key: "apiKey", label: "API Key", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/lemonsqueezy" },

  // ── AI & ML ──
  { type: "openai", name: "OpenAI", category: "AI", description: "Use the many tools ChatGPT has to offer", fields: [{ key: "apiKey", label: "API Key", placeholder: "sk-••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/openai" },
  { type: "anthropic", name: "Anthropic (Claude)", category: "AI", description: "AI-powered assistant for content creation and code generation", fields: [{ key: "apiKey", label: "API Key", placeholder: "sk-ant-••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/anthropic" },
  { type: "google-gemini", name: "Google Gemini", category: "AI", description: "Use the new Gemini models from Google", fields: [{ key: "apiKey", label: "API Key", placeholder: "AIza...", secret: true }], logoUrl: "https://cdn.simpleicons.org/googlegemini" },
  { type: "huggingface", name: "Hugging Face", category: "AI", description: "Run inference on 100,000+ open ML models", fields: [{ key: "apiToken", label: "API Token", placeholder: "hf_••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/huggingface" },
  { type: "openrouter", name: "OpenRouter", category: "AI", description: "Use any AI model via OpenRouter.ai", fields: [{ key: "apiKey", label: "API Key", placeholder: "sk-or-••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/openai" },
  { type: "groq", name: "Groq", category: "AI", description: "Use Groq's fast language models and audio processing", fields: [{ key: "apiKey", label: "API Key", placeholder: "gsk_••••••", secret: true }] },
  { type: "mistral", name: "Mistral AI", category: "AI", description: "State-of-the-art open-weight and hosted language models", fields: [{ key: "apiKey", label: "API Key", placeholder: "••••••", secret: true }] },

  // ── Search ──
  { type: "meilisearch", name: "Meilisearch", category: "Search", description: "Open-source, lightning-fast search engine", fields: [{ key: "host", label: "Host", placeholder: "https://ms.example.com" }, { key: "apiKey", label: "API Key", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/meilisearch" },
  { type: "algolia", name: "Algolia", category: "Search", description: "AI-powered search and discovery platform", fields: [{ key: "appId", label: "Application ID", placeholder: "XXXXXX" }, { key: "apiKey", label: "Admin API Key", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/algolia" },
  { type: "pinecone", name: "Pinecone", category: "Search", description: "Manage vector databases, store embeddings, and perform similarity searches", fields: [{ key: "apiKey", label: "API Key", placeholder: "••••••", secret: true }, { key: "environment", label: "Environment", placeholder: "us-east-1-aws" }], logoUrl: "https://cdn.simpleicons.org/pinecone" },
  { type: "qdrant", name: "Qdrant", category: "Search", description: "Make any action on your Qdrant vector database", fields: [{ key: "url", label: "Qdrant URL", placeholder: "https://qdrant.example.com:6333" }, { key: "apiKey", label: "API Key", placeholder: "••••••", secret: true }] },

  // ── Analytics & Monitoring ──
  { type: "posthog", name: "PostHog", category: "Analytics", description: "Open-source product analytics", fields: [{ key: "host", label: "Host", placeholder: "https://app.posthog.com" }, { key: "apiKey", label: "Project API Key", placeholder: "phc_••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/posthog" },
  { type: "plausible", name: "Plausible", category: "Analytics", description: "Privacy-friendly web analytics", fields: [{ key: "host", label: "Host", placeholder: "https://plausible.io" }, { key: "apiKey", label: "API Key", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/plausibleanalytics" },
  { type: "matomo", name: "Matomo", category: "Analytics", description: "Open source alternative to Google Analytics", fields: [{ key: "url", label: "Matomo URL", placeholder: "https://matomo.example.com" }, { key: "token", label: "Auth Token", placeholder: "••••••", secret: true }, { key: "siteId", label: "Site ID", placeholder: "1" }], logoUrl: "https://cdn.simpleicons.org/matomo" },
  { type: "sentry", name: "Sentry", category: "Analytics", description: "Application monitoring and error tracking", fields: [{ key: "dsn", label: "DSN", placeholder: "https://xxx@sentry.io/123" }, { key: "authToken", label: "Auth Token", placeholder: "sntrys_••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/sentry" },
  { type: "datadog", name: "Datadog", category: "Analytics", description: "Cloud monitoring and analytics platform", fields: [{ key: "apiKey", label: "API Key", placeholder: "••••••", secret: true }, { key: "appKey", label: "Application Key", placeholder: "••••••", secret: true }, { key: "site", label: "Site", placeholder: "datadoghq.com" }], logoUrl: "https://cdn.simpleicons.org/datadog" },
  { type: "grafana", name: "Grafana", category: "Analytics", description: "Monitoring and alerting made easy", fields: [{ key: "url", label: "Grafana URL", placeholder: "https://grafana.example.com" }, { key: "apiKey", label: "API Key", placeholder: "eyJ...", secret: true }], logoUrl: "https://cdn.simpleicons.org/grafana" },

  // ── DevOps & CI/CD ──
  { type: "github", name: "GitHub", category: "DevOps", description: "Collaboration tool for developers", fields: [{ key: "token", label: "Personal Access Token", placeholder: "ghp_••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/github" },
  { type: "gitlab", name: "GitLab", category: "DevOps", description: "Developer platform for code, CI/CD, and DevSecOps", fields: [{ key: "host", label: "GitLab URL", placeholder: "https://gitlab.com" }, { key: "token", label: "Personal Access Token", placeholder: "glpat-••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/gitlab" },
  { type: "vercel", name: "Vercel", category: "DevOps", description: "Deploy projects and manage environment variables", fields: [{ key: "token", label: "API Token", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/vercel" },
  { type: "netlify", name: "Netlify", category: "DevOps", description: "Platform for building and deploying websites and apps", fields: [{ key: "token", label: "Personal Access Token", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/netlify" },
  { type: "docker", name: "Docker Hub", category: "DevOps", description: "Container registry for Docker images", fields: [{ key: "username", label: "Username", placeholder: "myuser" }, { key: "password", label: "Access Token", placeholder: "dckr_pat_••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/docker" },

  // ── Accounting ──
  { type: "xero", name: "Xero", category: "Accounting", description: "Beautiful accounting software", fields: [{ key: "clientId", label: "Client ID", placeholder: "xxxxxxxx" }, { key: "clientSecret", label: "Client Secret", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/xero" },
  { type: "quickbooks", name: "QuickBooks Online", category: "Accounting", description: "Comprehensive online accounting software for small businesses", fields: [{ key: "clientId", label: "Client ID", placeholder: "ABxxxxxxxx" }, { key: "clientSecret", label: "Client Secret", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/quickbooks" },
  { type: "freshbooks", name: "FreshBooks", category: "Accounting", description: "Accounting and invoicing software for small businesses", fields: [{ key: "clientId", label: "Client ID", placeholder: "xxxxxxxx" }, { key: "clientSecret", label: "Client Secret", placeholder: "••••••", secret: true }] },
  { type: "invoiceninja", name: "Invoice Ninja", category: "Accounting", description: "Free open-source invoicing tool", fields: [{ key: "url", label: "URL", placeholder: "https://invoicing.example.com" }, { key: "apiToken", label: "API Token", placeholder: "••••••", secret: true }] },

  // ── E-Commerce ──
  { type: "shopify", name: "Shopify", category: "E-Commerce", description: "Ecommerce platform for online stores", fields: [{ key: "shopDomain", label: "Shop Domain", placeholder: "mystore.myshopify.com" }, { key: "accessToken", label: "Admin API Access Token", placeholder: "shpat_••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/shopify" },
  { type: "woocommerce", name: "WooCommerce", category: "E-Commerce", description: "E-commerce platform built on WordPress", fields: [{ key: "url", label: "Store URL", placeholder: "https://mystore.com" }, { key: "consumerKey", label: "Consumer Key", placeholder: "ck_••••••", secret: true }, { key: "consumerSecret", label: "Consumer Secret", placeholder: "cs_••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/woocommerce" },
  { type: "bigcommerce", name: "BigCommerce", category: "E-Commerce", description: "Leading e-commerce platform for online stores", fields: [{ key: "storeHash", label: "Store Hash", placeholder: "xxxxxxxx" }, { key: "accessToken", label: "Access Token", placeholder: "••••••", secret: true }] },

  // ── Forms & Surveys ──
  { type: "typeform", name: "Typeform", category: "Forms", description: "Create beautiful online forms and surveys", fields: [{ key: "accessToken", label: "Personal Access Token", placeholder: "tfp_••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/typeform" },
  { type: "google-forms", name: "Google Forms", category: "Forms", description: "Receive form responses from Google Forms", fields: [{ key: "serviceAccountKey", label: "Service Account Key (JSON)", placeholder: '{"type":"service_account"...}', secret: true }], logoUrl: "https://cdn.simpleicons.org/googleforms" },
  { type: "tally", name: "Tally", category: "Forms", description: "Receive form submissions from Tally forms", fields: [{ key: "apiKey", label: "API Key", placeholder: "••••••", secret: true }] },
  { type: "jotform", name: "JotForm", category: "Forms", description: "Create online forms and surveys", fields: [{ key: "apiKey", label: "API Key", placeholder: "••••••", secret: true }] },

  // ── Scheduling ──
  { type: "cal-com", name: "Cal.com", category: "Scheduling", description: "Open-source alternative to Calendly", fields: [{ key: "apiKey", label: "API Key", placeholder: "cal_live_••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/caldotcom" },
  { type: "calendly", name: "Calendly", category: "Scheduling", description: "Simple, modern scheduling", fields: [{ key: "accessToken", label: "Personal Access Token", placeholder: "eyJ...", secret: true }], logoUrl: "https://cdn.simpleicons.org/calendly" },

  // ── Content & CMS ──
  { type: "wordpress", name: "WordPress", category: "CMS", description: "Open-source website creation software", fields: [{ key: "url", label: "Site URL", placeholder: "https://mysite.com" }, { key: "username", label: "Username", placeholder: "admin" }, { key: "appPassword", label: "Application Password", placeholder: "xxxx xxxx xxxx", secret: true }], logoUrl: "https://cdn.simpleicons.org/wordpress" },
  { type: "ghost", name: "Ghost", category: "CMS", description: "Publishing platform for professional bloggers", fields: [{ key: "url", label: "Ghost URL", placeholder: "https://myblog.ghost.io" }, { key: "adminApiKey", label: "Admin API Key", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/ghost" },
  { type: "contentful", name: "Contentful", category: "CMS", description: "Content infrastructure for digital teams", fields: [{ key: "spaceId", label: "Space ID", placeholder: "xxxxxxxx" }, { key: "accessToken", label: "Content Management Token", placeholder: "CFPAT-••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/contentful" },
  { type: "strapi", name: "Strapi", category: "CMS", description: "Open-source headless CMS", fields: [{ key: "url", label: "Strapi URL", placeholder: "https://strapi.example.com" }, { key: "apiToken", label: "API Token", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/strapi" },

  // ── Productivity ──
  { type: "google-sheets", name: "Google Sheets", category: "Productivity", description: "Create, edit, and collaborate on spreadsheets online", fields: [{ key: "serviceAccountKey", label: "Service Account Key (JSON)", placeholder: '{"type":"service_account"...}', secret: true }], logoUrl: "https://cdn.simpleicons.org/googlesheets" },
  { type: "google-drive", name: "Google Drive", category: "Productivity", description: "Stay connected and organized", fields: [{ key: "serviceAccountKey", label: "Service Account Key (JSON)", placeholder: '{"type":"service_account"...}', secret: true }], logoUrl: "https://cdn.simpleicons.org/googledrive" },
  { type: "airtable", name: "Airtable", category: "Productivity", description: "Interactive spreadsheets with collaboration", fields: [{ key: "apiKey", label: "Personal Access Token", placeholder: "pat••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/airtable" },
  { type: "google-calendar", name: "Google Calendar", category: "Productivity", description: "Get organized and stay on schedule", fields: [{ key: "serviceAccountKey", label: "Service Account Key (JSON)", placeholder: '{"type":"service_account"...}', secret: true }], logoUrl: "https://cdn.simpleicons.org/googlecalendar" },
  { type: "figma", name: "Figma", category: "Productivity", description: "Collaborative interface design tool", fields: [{ key: "accessToken", label: "Personal Access Token", placeholder: "figd_••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/figma" },

  // ── Security & Secrets ──
  { type: "hashicorp-vault", name: "HashiCorp Vault", category: "Security", description: "Securely manage secrets and sensitive data", fields: [{ key: "url", label: "Vault URL", placeholder: "https://vault.example.com" }, { key: "token", label: "Token", placeholder: "hvs.••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/vault" },
  { type: "aws-secrets", name: "AWS Secrets Manager", category: "Security", description: "Manage secrets in AWS", fields: [{ key: "region", label: "Region", placeholder: "us-east-1" }, { key: "accessKey", label: "Access Key", placeholder: "AKIA..." }, { key: "secretKey", label: "Secret Key", placeholder: "••••••", secret: true }], logoUrl: "https://cdn.simpleicons.org/amazonaws" },
];

export const CATEGORY_COLORS: Record<string, string> = {
  Database: "bg-amber-50 text-amber-600",
  Storage: "bg-blue-50 text-blue-600",
  Cache: "bg-red-50 text-red-600",
  Queue: "bg-purple-50 text-purple-600",
  Mail: "bg-green-50 text-green-600",
  Communication: "bg-indigo-50 text-indigo-600",
  CRM: "bg-orange-50 text-orange-600",
  "Project Management": "bg-violet-50 text-violet-600",
  Payments: "bg-emerald-50 text-emerald-600",
  AI: "bg-fuchsia-50 text-fuchsia-600",
  Search: "bg-cyan-50 text-cyan-600",
  Analytics: "bg-teal-50 text-teal-600",
  DevOps: "bg-slate-100 text-slate-600",
  Accounting: "bg-lime-50 text-lime-600",
  "E-Commerce": "bg-rose-50 text-rose-600",
  Forms: "bg-sky-50 text-sky-600",
  Scheduling: "bg-yellow-50 text-yellow-600",
  CMS: "bg-pink-50 text-pink-600",
  Productivity: "bg-blue-50 text-blue-600",
  Security: "bg-red-50 text-red-600",
};
