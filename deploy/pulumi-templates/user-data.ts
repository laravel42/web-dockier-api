import type { DeployParams } from "./types";

/** Generate cloud-init user_data script for VPS Docker deployments */
export function buildDockerUserData(p: DeployParams): string {
  const vpsSvcs = p.services.filter(s => s.mode === "vps");
  const hasVpsDb = vpsSvcs.some(s => s.type === "database");
  const hasVpsCache = vpsSvcs.some(s => s.type === "cache");
  const hasVpsQueue = vpsSvcs.some(s => s.type === "queue") || (p.aiAnalysis?.needsQueueWorker ?? false);

  const isLaravel = p.techStack.some(s => s.toLowerCase() === "laravel");

  let dbSetup = "";
  if (hasVpsDb && !p.templateSetupScript) {
    // Default PostgreSQL setup (skip if template provides its own DB setup, e.g. MySQL for WordPress)
    dbSetup = `
    # ── PostgreSQL ──
    apt-get install -y postgresql postgresql-contrib
    systemctl enable postgresql
    sudo -u postgres psql -c "CREATE USER appuser WITH PASSWORD 'apppass123';"
    sudo -u postgres psql -c "CREATE DATABASE appdb OWNER appuser;"`;
  }

  // Template-specific setup (e.g. MySQL for WordPress)
  const templateSetup = p.templateSetupScript || "";

  let cacheSetup = "";
  if (hasVpsCache) {
    cacheSetup = `
    # ── Redis ──
    apt-get install -y redis-server
    systemctl enable redis-server
    sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis/redis.conf
    systemctl restart redis-server`;
  }

  let queueSetup = "";
  if (hasVpsQueue && isLaravel) {
    queueSetup = `
    # ── Queue Worker (Supervisor) ──
    apt-get install -y supervisor
    cat > /etc/supervisor/conf.d/${p.appName}-worker.conf << 'SUPERVISOR'
[program:${p.appName}-worker]
command=docker exec ${p.appName} php artisan queue:work --sleep=3 --tries=3 --max-time=3600
autostart=true
autorestart=true
numprocs=1
SUPERVISOR
    supervisorctl reread && supervisorctl update`;
  }

  // Build ECR image URI from deploy params (available when provider is AWS)
  const ecrImageUri = p.ecrImageUri || "";
  // Public Docker image (for template deploys like WordPress)
  const publicImage = p.publicDockerImage || "";

  const isAws = p.provider === "aws";
  const basePkgs = "curl git unzip nginx certbot python3-certbot-nginx";

  // awscli is only needed for ECR image pulls (not for template deploys using public images)
  const needsAwsCli = isAws && !publicImage;

  // Build env var flags for docker run
  const envEntries = (p.dockerEnvVars || []).map(e => `-e ${e.name}="${e.value}"`);
  const allEnvFlags = [
    `-e APP_ENV=production`,
    `-e PORT=${p.runtime.port}`,
    ...envEntries,
  ];
  const envFlagsStr = allEnvFlags.join(" \\\n    ");

  return `#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# ── System Setup ──
apt-get update -y
apt-get install -y ${basePkgs}

# ── Docker ──
curl -fsSL https://get.docker.com | sh
systemctl enable docker
${needsAwsCli ? `
# ── AWS CLI (installed from official bundle — not available via apt on Ubuntu 24.04) ──
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp
/tmp/aws/install
rm -rf /tmp/aws /tmp/awscliv2.zip
` : ""}
${dbSetup}${templateSetup}${cacheSetup}

# ── Pull & Run Docker Image ──
ECR_IMAGE="${ecrImageUri}"
PUBLIC_IMAGE="${publicImage}"

if [ -n "$PUBLIC_IMAGE" ]; then
  # Template deploy: pull public Docker image and bind directly to port 80
  for i in $(seq 1 6); do
    docker pull "$PUBLIC_IMAGE" && break
    sleep 10
  done
  docker stop ${p.appName} 2>/dev/null || true
  docker rm ${p.appName} 2>/dev/null || true
  # Stop nginx so port 80 is free for Docker to bind directly
  systemctl stop nginx 2>/dev/null || true
  systemctl disable nginx 2>/dev/null || true
  # Bind directly to 0.0.0.0:80 — no Nginx needed for template deploys
  docker run -d --name ${p.appName} --restart=always \\
    -p 0.0.0.0:80:${p.runtime.port} \\
    --add-host=host.docker.internal:host-gateway \\
    ${envFlagsStr} \\
    "$PUBLIC_IMAGE"
  # Increase PHP and Apache limits for WordPress (large imports, media uploads)
  docker exec ${p.appName} bash -c 'printf "upload_max_filesize = 512M\\npost_max_size = 512M\\nmemory_limit = 1024M\\nmax_execution_time = 600\\nmax_input_time = 600\\n" > /usr/local/etc/php/conf.d/uploads.ini' 2>/dev/null || true
  docker exec ${p.appName} bash -c 'printf "Timeout 600\\nKeepAliveTimeout 600\\n" >> /etc/apache2/apache2.conf' 2>/dev/null || true
  docker restart ${p.appName} 2>/dev/null || true
  # Skip Nginx for template deploys
  SKIP_NGINX=1
elif [ -n "$ECR_IMAGE" ]; then
  REGION=$(echo "$ECR_IMAGE" | cut -d. -f4)
  # Retry ECR login + pull (image may not be available immediately)
  for i in $(seq 1 12); do
    aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$(echo "$ECR_IMAGE" | cut -d/ -f1)" && break
    sleep 10
  done
  for i in $(seq 1 12); do
    docker pull "$ECR_IMAGE" && break
    sleep 15
  done
  docker stop ${p.appName} 2>/dev/null || true
  docker rm ${p.appName} 2>/dev/null || true
  # PHP/Laravel images run nginx on port 80 inside the container;
  # other runtimes listen on the configured runtime port.
  CONTAINER_PORT=${p.runtime.name === "php" ? "80" : String(p.runtime.port)}
  docker run -d --name ${p.appName} --restart=always \\
    -p 127.0.0.1:${p.runtime.port}:$CONTAINER_PORT \\
    --add-host=host.docker.internal:host-gateway \\
    -e APP_ENV=production \\
    -e PORT=${p.runtime.port} \\
    "$ECR_IMAGE"
fi

# ── Nginx Reverse Proxy ──
if [ "\${SKIP_NGINX:-0}" != "1" ]; then
cat > /etc/nginx/sites-available/${p.appName} << 'NGINX'
server {
    listen 80;
    server_name _;
    client_max_body_size 100M;
    location / {
        proxy_pass http://127.0.0.1:${p.runtime.port};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX
ln -sf /etc/nginx/sites-available/${p.appName} /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
systemctl restart nginx
fi
${queueSetup}

echo "✓ Server provisioned for ${p.appName}"`;
}
