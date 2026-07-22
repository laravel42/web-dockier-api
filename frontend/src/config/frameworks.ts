export interface Framework {
  id: string;
  name: string;
  category: string;
  icon: string;
  defaultDeployScript: string;
}

export interface FrameworkCategory {
  name: string;
  frameworks: Framework[];
}

// Deploy scripts run INSIDE the Docker container after it starts.
// No cd, git pull, or package install — those happen at build time.

const LARAVEL_DEPLOY = `# Laravel post-deploy commands
php artisan migrate --force
php artisan config:cache
php artisan route:cache
php artisan view:cache
php artisan queue:restart`;

const SYMFONY_DEPLOY = `# Symfony post-deploy commands
php bin/console doctrine:migrations:migrate --no-interaction
php bin/console cache:clear --env=prod
php bin/console cache:warmup --env=prod`;

const WORDPRESS_DEPLOY = `# WordPress post-deploy commands
wp core update-db --allow-root 2>/dev/null || true
wp cache flush --allow-root 2>/dev/null || true`;

const PHP_DEPLOY = `# PHP post-deploy commands
# Add your commands here`;

const NEXTJS_DEPLOY = `# Next.js post-deploy commands
# Container starts automatically via npm start or next start`;

const NUXTJS_DEPLOY = `# Nuxt.js post-deploy commands
# Container starts automatically via nuxt start`;

const NODEJS_DEPLOY = `# Node.js post-deploy commands
# Container starts automatically via the defined start command`;

const DJANGO_DEPLOY = `# Django post-deploy commands
python manage.py migrate --noinput
python manage.py collectstatic --noinput`;

const FLASK_DEPLOY = `# Flask post-deploy commands
# Container starts automatically via gunicorn or flask run`;

const HTML_DEPLOY = `# Static site — no post-deploy commands needed`;

const REACT_DEPLOY = `# React SPA — static output, no post-deploy commands needed`;

const VUE_DEPLOY = `# Vue.js SPA — static output, no post-deploy commands needed`;

const REMIX_DEPLOY = `# Remix post-deploy commands
# Container starts automatically via remix-serve or custom server`;

const SVELTE_DEPLOY = `# SvelteKit post-deploy commands
# Container starts automatically via node build`;

const ASTRO_DEPLOY = `# Astro post-deploy commands
# Container starts automatically via node ./dist/server/entry.mjs
# For static-only sites deployed to S3, no commands needed`;

const OTHER_DEPLOY = `# Post-deploy commands
# Add commands to run inside the container after it starts`;

export const FRAMEWORKS: Framework[] = [
  // PHP
  { id: "laravel", name: "Laravel", category: "PHP", icon: "/devicons/laravel.svg", defaultDeployScript: LARAVEL_DEPLOY },
  { id: "symfony", name: "Symfony", category: "PHP", icon: "/devicons/symfony.svg", defaultDeployScript: SYMFONY_DEPLOY },
  { id: "wordpress", name: "WordPress", category: "PHP", icon: "/devicons/wordpress.svg", defaultDeployScript: WORDPRESS_DEPLOY },
  { id: "statamic", name: "Statamic", category: "PHP", icon: "/devicons/statamic.svg", defaultDeployScript: LARAVEL_DEPLOY },
  { id: "php", name: "PHP", category: "PHP", icon: "/devicons/php.svg", defaultDeployScript: PHP_DEPLOY },

  // JavaScript
  { id: "nextjs", name: "Next.js", category: "JavaScript", icon: "/devicons/nextjs-dark.svg", defaultDeployScript: NEXTJS_DEPLOY },
  { id: "nuxtjs", name: "Nuxt.js", category: "JavaScript", icon: "/devicons/nuxtjs.svg", defaultDeployScript: NUXTJS_DEPLOY },
  { id: "react", name: "React", category: "JavaScript", icon: "/devicons/react.svg", defaultDeployScript: REACT_DEPLOY },
  { id: "vuejs", name: "Vue.js", category: "JavaScript", icon: "/devicons/vuejs.svg", defaultDeployScript: VUE_DEPLOY },
  { id: "remix", name: "Remix", category: "JavaScript", icon: "/devicons/remix.svg", defaultDeployScript: REMIX_DEPLOY },
  { id: "svelte", name: "SvelteKit", category: "JavaScript", icon: "/devicons/svelte.svg", defaultDeployScript: SVELTE_DEPLOY },
  { id: "astro", name: "Astro", category: "JavaScript", icon: "/devicons/astro-light.svg", defaultDeployScript: ASTRO_DEPLOY },
  { id: "nodejs", name: "Node.js", category: "JavaScript", icon: "/devicons/nodejs.svg", defaultDeployScript: NODEJS_DEPLOY },

  // Python
  { id: "django", name: "Django", category: "Python", icon: "/devicons/django.svg", defaultDeployScript: DJANGO_DEPLOY },
  { id: "flask", name: "Flask", category: "Python", icon: "/devicons/flask-dark.svg", defaultDeployScript: FLASK_DEPLOY },

  // Static
  { id: "html", name: "HTML", category: "Static", icon: "/devicons/html5.svg", defaultDeployScript: HTML_DEPLOY },

  // Other
  { id: "other", name: "Other", category: "Other", icon: "/devicons/generic.svg", defaultDeployScript: OTHER_DEPLOY },
];

export const FRAMEWORK_CATEGORIES: FrameworkCategory[] = (() => {
  const categoryOrder = ["PHP", "JavaScript", "Python", "Static", "Other"];
  const map = new Map<string, Framework[]>();
  for (const fw of FRAMEWORKS) {
    const list = map.get(fw.category) ?? [];
    list.push(fw);
    map.set(fw.category, list);
  }
  return categoryOrder
    .filter((cat) => map.has(cat))
    .map((cat) => ({ name: cat, frameworks: map.get(cat)! }));
})();

export function getFrameworkById(id: string): Framework | undefined {
  return FRAMEWORKS.find((fw) => fw.id === id);
}

export function getFrameworkLabel(id: string): string {
  return getFrameworkById(id)?.name ?? id;
}

export function getDefaultDeployScript(platformId: string): string {
  return getFrameworkById(platformId)?.defaultDeployScript ?? OTHER_DEPLOY;
}
