import type { ProjectTemplate } from "@/types";

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "wordpress",
    name: "WordPress",
    description: "Full WordPress setup with MySQL database, ready to deploy",
    icon: "wordpress",
    defaultRepo: "https://github.com/WordPress/WordPress.git",
    defaultBranch: "master",
  },
];
