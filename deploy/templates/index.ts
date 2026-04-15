/**
 * Template definitions for pre-built project deployments.
 * Each template provides a known Docker image, port, services, and env vars
 * so the deploy pipeline can skip repo clone/analysis.
 */

export interface TemplateConfig {
  id: string;
  name: string;
  /** Official Docker image to use (no build needed) */
  dockerImage: string;
  /** Port the container listens on */
  port: number;
  /** Runtime info for Pulumi templates */
  runtime: { name: string; version: string; buildCmd: string; startCmd: string; port: number };
  /** Tech stack labels */
  techStack: string[];
  primaryLanguage: string;
  /** Services this template needs (e.g. MySQL for WordPress) */
  services: Array<{ type: string; name: string }>;
  /** Default environment variables */
  envVars: Array<{ name: string; value: string }>;
  /** User-data script additions for VPS deploys (runs after Docker is installed) */
  vpsSetupScript: string;
}

const TEMPLATES: Record<string, TemplateConfig> = {
  wordpress: {
    id: "wordpress",
    name: "WordPress",
    dockerImage: "wordpress:latest",
    port: 80,
    runtime: { name: "php", version: "8.3", buildCmd: "", startCmd: "apache2-foreground", port: 80 },
    techStack: ["WordPress", "PHP", "MySQL", "Apache"],
    primaryLanguage: "PHP",
    services: [{ type: "database", name: "MySQL" }],
    envVars: [
      { name: "WORDPRESS_DB_HOST", value: "host.docker.internal:3306" },
      { name: "WORDPRESS_DB_USER", value: "wordpress" },
      { name: "WORDPRESS_DB_PASSWORD", value: "wordpress" },
      { name: "WORDPRESS_DB_NAME", value: "wordpress" },
    ],
    vpsSetupScript: `
    # ── MySQL for WordPress ──
    apt-get install -y mysql-server
    systemctl enable mysql
    systemctl start mysql
    # Wait for MySQL to be ready
    for i in $(seq 1 30); do
      mysqladmin ping -h localhost --silent && break
      sleep 2
    done
    mysql -e "CREATE DATABASE IF NOT EXISTS wordpress;" || true
    mysql -e "CREATE USER IF NOT EXISTS 'wordpress'@'%' IDENTIFIED BY 'wordpress';" || true
    mysql -e "GRANT ALL PRIVILEGES ON wordpress.* TO 'wordpress'@'%';" || true
    mysql -e "FLUSH PRIVILEGES;" || true
    # Allow connections from Docker containers and increase limits for large imports
    sed -i 's/^bind-address.*/bind-address = 0.0.0.0/' /etc/mysql/mysql.conf.d/mysqld.cnf || true
    echo -e "[mysqld]\\nmax_allowed_packet = 512M\\nwait_timeout = 600\\ninteractive_timeout = 600\\nnet_read_timeout = 600\\nnet_write_timeout = 600" > /etc/mysql/mysql.conf.d/zz-wordpress.cnf || true
    systemctl restart mysql || true`,
  },
};

export function getTemplateConfig(templateId: string): TemplateConfig | null {
  return TEMPLATES[templateId] || null;
}

export function listTemplates(): TemplateConfig[] {
  return Object.values(TEMPLATES);
}
