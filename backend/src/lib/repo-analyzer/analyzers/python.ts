import type { RepoConfig } from "../types.js";
import type { RepoFiles } from "../repo-files.js";
import { joinPath } from "../repo-files.js";

export function analyzePythonProject(files: RepoFiles, appDir: string, config: RepoConfig) {
  const readApp = (name: string) => files.read(joinPath(appDir, name));
  const existsApp = (name: string) => files.exists(joinPath(appDir, name));

  config.runtime = "python";
  config.packageManager = "pip";

  if (existsApp("manage.py")) {
    config.framework = "django";
    config.port = 8000;
  }

  const pyproject = readApp("pyproject.toml");
  if (pyproject !== null) {
    const pyVerMatch = pyproject.match(/requires-python\s*=\s*["']>=?(\d+\.\d+)/);
    if (pyVerMatch) config.pythonVersion = pyVerMatch[1];
    if (pyproject.includes("django")) { config.framework = "django"; config.port = 8000; }
    else if (pyproject.includes("fastapi")) { config.framework = "fastapi"; config.port = 8000; }
    else if (pyproject.includes("flask")) { config.framework = "flask"; config.port = 5000; }
  }

  const requirements = readApp("requirements.txt");
  if (requirements !== null) {
    if (requirements.includes("Django") || requirements.includes("django")) { config.framework = "django"; config.port = 8000; }
    else if (requirements.includes("fastapi")) { config.framework = "fastapi"; config.port = 8000; }
    else if (requirements.includes("flask") || requirements.includes("Flask")) { config.framework = "flask"; config.port = 5000; }
    if (requirements.includes("gunicorn")) config.startCommand = "gunicorn";
    if (requirements.includes("uvicorn")) config.startCommand = "uvicorn";
  }

  const runtime = readApp("runtime.txt");
  if (runtime !== null) {
    const match = runtime.trim().match(/python-(\d+\.\d+)/);
    if (match) config.pythonVersion = match[1];
  }

  config.runtimeVersion = config.pythonVersion || "3.12";
  if (!config.pythonVersion) config.pythonVersion = "3.12";
}
