import type { DeployParams } from "./types.js";

/** Generate cloud-init user_data script for VPS Docker deployments */
export function buildDockerUserData(p: DeployParams): string {
  const vpsSvcs = p.services.filter(s => s.mode === "vps");
  const hasVpsDb = vpsSvcs.some(s => s.type === "database");
  const hasVpsCache = vpsSvcs.some(s => s.type === "cache");
  const hasVpsQueue = vpsSvcs.some(s => s.type === "queue") || (p.aiAnalysis?.needsQueueWorker ?? false);

  const isLaravel = p.techStack.some(s => s.toLowerCase() === "laravel");

  // The container port is what the app listens on inside the container.
  // The host port is what Docker binds to on 127.0.0.1 for nginx to proxy to.
  // These must differ from 80 because nginx already listens on port 80 externally.
  const containerPort = p.runtime.port;
  const hostPort = containerPort === 80 || containerPort === 443 ? 8080 : containerPort;

  let dbSetup = "";
  if (hasVpsDb && !p.templateSetupScript) {
    // Detect whether the app needs MySQL or PostgreSQL based on extensions and tech stack
    const needsMysql = p.aiAnalysis?.phpExtensions?.includes("pdo_mysql") ||
      p.techStack.some(s => s.toLowerCase().includes("mysql")) ||
      vpsSvcs.some(s => s.type === "database" && s.name.toLowerCase().includes("mysql"));

    if (needsMysql) {
      dbSetup = `
    # ── MySQL ──
    apt-get install -y mysql-server
    systemctl enable mysql
    systemctl start mysql
    for i in $(seq 1 30); do mysqladmin ping -h localhost --silent && break; sleep 2; done
    # Create database and user (placeholders replaced at deploy time with user's actual values)
    # MySQL 8.0 on Ubuntu 24.04: root uses mysql_native_password with a random password.
    # Use debian-sys-maint (auto-generated credentials) to bootstrap.
    DB_NAME="__DEPLOY_DB_NAME__"
    DB_USER="__DEPLOY_DB_USER__"
    DB_PASS="__DEPLOY_DB_PASS__"
    mysql --defaults-file=/etc/mysql/debian.cnf -e "CREATE DATABASE IF NOT EXISTS $DB_NAME;"
    if [ "$DB_USER" = "root" ]; then
      mysql --defaults-file=/etc/mysql/debian.cnf -e "ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '$DB_PASS';"
      mysql --defaults-file=/etc/mysql/debian.cnf -e "CREATE USER IF NOT EXISTS 'root'@'%' IDENTIFIED BY '$DB_PASS';"
      mysql --defaults-file=/etc/mysql/debian.cnf -e "GRANT ALL PRIVILEGES ON *.* TO 'root'@'%' WITH GRANT OPTION;"
    else
      mysql --defaults-file=/etc/mysql/debian.cnf -e "CREATE USER IF NOT EXISTS '$DB_USER'@'%' IDENTIFIED BY '$DB_PASS';"
      mysql --defaults-file=/etc/mysql/debian.cnf -e "GRANT ALL PRIVILEGES ON $DB_NAME.* TO '$DB_USER'@'%';"
    fi
    mysql --defaults-file=/etc/mysql/debian.cnf -e "FLUSH PRIVILEGES;"
    # Bind MySQL to all interfaces so Docker containers can connect via host.docker.internal
    # Handle all possible config locations on Ubuntu 22.04/24.04 with MySQL 8.0
    for CNFFILE in /etc/mysql/mysql.conf.d/mysqld.cnf /etc/mysql/my.cnf /etc/mysql/conf.d/mysql.cnf; do
      if [ -f "$CNFFILE" ]; then
        sed -i 's/^[[:space:]]*bind-address[[:space:]]*=.*/bind-address = 0.0.0.0/' "$CNFFILE"
        sed -i 's/^[[:space:]]*mysqlx-bind-address[[:space:]]*=.*/mysqlx-bind-address = 0.0.0.0/' "$CNFFILE"
      fi
    done
    systemctl restart mysql
    # Wait for MySQL to be fully ready after restart before proceeding
    for i in $(seq 1 30); do mysqladmin ping -h localhost --silent && break; sleep 2; done`;
    } else {
      dbSetup = `
    # ── PostgreSQL ──
    apt-get install -y postgresql postgresql-contrib
    systemctl enable postgresql
    sudo -u postgres psql -c "CREATE USER appuser WITH PASSWORD 'apppass123';"
    sudo -u postgres psql -c "CREATE DATABASE appdb OWNER appuser;"`;
    }
  }

  // Template-specific setup (e.g. MySQL for WordPress)
  const templateSetup = p.templateSetupScript || "";

  let cacheSetup = "";
  if (hasVpsCache) {
    cacheSetup = `
    # ── Redis ──
    apt-get install -y redis-server
    systemctl enable redis-server
    sed -i 's/^bind .*/bind 127.0.0.1 172.17.0.1/' /etc/redis/redis.conf
    sed -i 's/^protected-mode yes/protected-mode no/' /etc/redis/redis.conf
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

  // Scheduler cron — needed for Laravel projects regardless of provider (AWS/GCP)
  const needsScheduler = p.aiAnalysis?.needsScheduler || vpsSvcs.some(s => s.type === "scheduler");
  let schedulerSetup = "";
  if (needsScheduler && isLaravel) {
    schedulerSetup = `
# ── Task Scheduler (Cron) ──
(crontab -l 2>/dev/null | grep -Fv "artisan schedule:run"; echo "* * * * * docker exec ${p.appName} php artisan schedule:run >> /var/log/${p.appName}-scheduler.log 2>&1") | crontab -
echo "Scheduler cron installed"`;
  }

  // Build ECR image URI from deploy params (available when provider is AWS)
  const ecrImageUri = p.ecrImageUri || "";
  // Public Docker image (for template deploys like WordPress)
  const publicImage = p.publicDockerImage || "";
  // GCP Artifact Registry image (placeholder — replaced at deploy time by the deploy processor)
  const arImageUri = "__AR_IMAGE_URI__";
  // GCP access token for one-time docker login (placeholder — replaced at deploy time)
  const arToken = "__AR_TOKEN__";

  const isAws = p.provider === "aws";
  const basePkgs = "curl git unzip nginx certbot python3-certbot-nginx";

  // awscli is only needed for ECR image pulls (not for template deploys using public images)
  const needsAwsCli = isAws && !publicImage;

  // Build env var flags for docker run
  // Two categories:
  //   1. "defaults" — come BEFORE user env vars so user values override them
  //   2. "overrides" — come AFTER user env vars because they must be correct for the infra
  //      (e.g. DB_HOST must be host.docker.internal, not 127.0.0.1 from a local .env)
  const envEntries = (p.dockerEnvVars || []).map(e => `-e ${e.name}="${e.value}"`);
  const defaultEnvFlags = [
    `-e APP_ENV=production`,
    `-e PORT=${containerPort}`,
    ...envEntries,
  ];
  const overrideEnvFlags: string[] = [];

  // Add database connection env vars when a VPS database is provisioned
  if (hasVpsDb && !p.templateSetupScript) {
    const needsMysql = p.aiAnalysis?.phpExtensions?.includes("pdo_mysql") ||
      p.techStack.some(s => s.toLowerCase().includes("mysql")) ||
      vpsSvcs.some(s => s.type === "database" && s.name.toLowerCase().includes("mysql"));

    // DB_HOST must always point to the host machine from inside Docker — override user value
    overrideEnvFlags.push(`-e DB_HOST=host.docker.internal`);
    // These are defaults the user can override via wizard env vars
    defaultEnvFlags.push(`-e DB_PORT=${needsMysql ? "3306" : "5432"}`);
    defaultEnvFlags.push(`-e DB_DATABASE=${needsMysql ? "forge" : "appdb"}`);
    defaultEnvFlags.push(`-e DB_USERNAME=appuser`);
    defaultEnvFlags.push(`-e DB_PASSWORD=apppass123`);
    defaultEnvFlags.push(`-e DB_CONNECTION=${needsMysql ? "mysql" : "pgsql"}`);
    if (isLaravel) {
      defaultEnvFlags.push(`-e APP_KEY=base64:$(openssl rand -base64 32)`);
    }
  }

  // Add Redis env vars when a VPS cache is provisioned
  if (hasVpsCache) {
    // REDIS_HOST must point to host machine — override user value
    overrideEnvFlags.push(`-e REDIS_HOST=host.docker.internal`);
    // These are defaults the user can override
    defaultEnvFlags.push(`-e CACHE_DRIVER=redis`);
    defaultEnvFlags.push(`-e SESSION_DRIVER=redis`);
  }

  const defaultEnvStr = defaultEnvFlags.join(" \\\n    ");
  const overrideEnvStr = overrideEnvFlags.join(" \\\n    ");

  // Placeholder for user-provided env vars from the deploy wizard (replaced at deploy time)
  const userEnvPlaceholder = "__USER_ENV_FLAGS__";

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
AR_IMAGE="${arImageUri}"

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
    -p 0.0.0.0:80:${containerPort} \\
    --add-host=host.docker.internal:host-gateway \\
    ${defaultEnvStr} \\
    ${userEnvPlaceholder} \\
    ${overrideEnvStr} \\
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
  # All runtimes listen on their configured port inside the container.
  # The host port may differ from the container port to avoid conflicting with nginx on port 80.
  docker run -d --name ${p.appName} --restart=always \\
    -p 127.0.0.1:${hostPort}:${containerPort} \\
    --add-host=host.docker.internal:host-gateway \\
    ${defaultEnvStr} \\
    ${userEnvPlaceholder} \\
    ${overrideEnvStr} \\
    "$ECR_IMAGE"
elif echo "$AR_IMAGE" | grep -q "docker.pkg.dev"; then
  # GCP Artifact Registry: authenticate using deploy-time access token
  AR_HOST=$(echo "$AR_IMAGE" | cut -d/ -f1)
  AR_TOKEN="${arToken}"
  if [ -n "$AR_TOKEN" ]; then
    echo "$AR_TOKEN" | docker login -u oauth2accesstoken --password-stdin "https://$AR_HOST" 2>/dev/null || true
  fi
  # Retry pull (image may not be available immediately after push)
  for i in $(seq 1 12); do
    docker pull "$AR_IMAGE" && break
    sleep 15
  done
  docker stop ${p.appName} 2>/dev/null || true
  docker rm ${p.appName} 2>/dev/null || true
  docker run -d --name ${p.appName} --restart=always \\
    -p 127.0.0.1:${hostPort}:${containerPort} \\
    --add-host=host.docker.internal:host-gateway \\
    ${defaultEnvStr} \\
    ${userEnvPlaceholder} \\
    ${overrideEnvStr} \\
    "$AR_IMAGE"
fi

# ── Nginx Reverse Proxy ──
if [ "\${SKIP_NGINX:-0}" != "1" ]; then
cat > /etc/nginx/sites-available/${p.appName} << 'NGINX'
server {
    listen 80;
    server_name _;
    client_max_body_size 100M;
    location / {
        proxy_pass http://127.0.0.1:${hostPort};
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
${schedulerSetup}

echo "✓ Server provisioned for ${p.appName}"`;
}
