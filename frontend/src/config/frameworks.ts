export interface Framework {
  id: string;
  name: string;
  category: string;
  icon: string; // path to SVG in /devicons/
}

export interface FrameworkCategory {
  name: string;
  frameworks: Framework[];
}

export const FRAMEWORKS: Framework[] = [
  // PHP
  { id: "laravel", name: "Laravel", category: "PHP", icon: "/devicons/laravel.svg" },
  { id: "symfony", name: "Symfony", category: "PHP", icon: "/devicons/symfony.svg" },
  { id: "wordpress", name: "WordPress", category: "PHP", icon: "/devicons/wordpress.svg" },
  { id: "statamic", name: "Statamic", category: "PHP", icon: "/devicons/statamic.svg" },
  { id: "php", name: "PHP", category: "PHP", icon: "/devicons/php.svg" },

  // JavaScript
  { id: "nextjs", name: "Next.js", category: "JavaScript", icon: "/devicons/nextjs-dark.svg" },
  { id: "nuxtjs", name: "Nuxt.js", category: "JavaScript", icon: "/devicons/nuxtjs.svg" },
  { id: "nodejs", name: "Node.js", category: "JavaScript", icon: "/devicons/nodejs.svg" },

  // Python
  { id: "django", name: "Django", category: "Python", icon: "/devicons/django.svg" },
  { id: "flask", name: "Flask", category: "Python", icon: "/devicons/flask-dark.svg" },

  // Static
  { id: "html", name: "HTML", category: "Static", icon: "/devicons/html5.svg" },

  // Other
  { id: "other", name: "Other", category: "Other", icon: "/devicons/generic.svg" },
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
