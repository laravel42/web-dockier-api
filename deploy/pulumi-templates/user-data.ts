import type { DeployParams } from "./types";

/** Generate cloud-init user_data script for VPS Docker deployments */
export function buildDockerUserData(p: DeployParams): string {
  const vpsSvcs = p.services.filter(s => s.mode === "vps");
  const hasVpsDb = vpsSvcs.some(s => s.type === "database");
  const hasVpsCache = vpsSvcs.some(s => s.type === "cache");
  const hasVpsQueue = vpsSvcs.some(s => s.type === "queue") || (p.aiAnalysis?.needsQueueWorker ?? false);

  const isLaravel = p.techStack.some(s => s.toLowerCase() === "laravel");
  const isNode = ["node", "typescript", "javascript"].includes(p.runtime.name.toLowerCase());

  let dbSetup = "";
  if (hasVpsDb) {
    dbSetup = `
    # ── PostgreSQL ──
    apt-get install -y postgresql postgresql-contrib
    systemctl enable postgresql
    sudo -u postgres psql -c "CREATE USER appuser WITH PASSWORD 'apppass123';"
    sudo -u postgres psql -c "CREATE DATABASE appdb OWNER appuser;"`;
  }

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

  return `#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

# ── System Setup ──
apt-get update -y
apt-get install -y curl git unzip nginx certbot python3-certbot-nginx awscli

# ── Docker ──
curl -fsSL https://get.docker.com | sh
systemctl enable docker
${dbSetup}${cacheSetup}

# ── Pull & Run Docker Image from ECR ──
ECR_IMAGE="${ecrImageUri}"
if [ -n "$ECR_IMAGE" ]; then
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
  docker run -d --name ${p.appName} --restart=always \\
    -p 127.0.0.1:${p.runtime.port}:${p.runtime.port} \\
    --add-host=host.docker.internal:host-gateway \\
    -e APP_ENV=production \\
    -e PORT=${p.runtime.port} \\
    "$ECR_IMAGE"
fi

# ── Nginx Reverse Proxy ──
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
${queueSetup}

echo "✓ Server provisioned for ${p.appName}"`;
}
