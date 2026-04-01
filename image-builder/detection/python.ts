// ─── Python Stack Detection & Dockerfile Generator ───

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DetectedStack } from "./types";

export function detectPython(appDir: string, subDir: string): Extract<DetectedStack, { runtime: "python" }> | null {
  if (!existsSync(join(appDir, "manage.py")) && !existsSync(join(appDir, "requirements.txt")) && !existsSync(join(appDir, "pyproject.toml")) && !existsSync(join(appDir, "Pipfile"))) {
    return null;
  }

  let framework: "django" | "fastapi" | "flask" | "generic" = "generic";
  if (existsSync(join(appDir, "manage.py"))) framework = "django";
  for (const file of ["requirements.txt", "pyproject.toml", "Pipfile"]) {
    const p = join(appDir, file);
    if (!existsSync(p)) continue;
    try {
      const content = readFileSync(p, "utf-8").toLowerCase();
      if (content.includes("django")) { framework = "django"; break; }
      if (content.includes("fastapi")) { framework = "fastapi"; break; }
      if (content.includes("flask")) { framework = "flask"; break; }
    } catch {}
  }
  return { runtime: "python", framework, subDir };
}

export function pythonDockerfile(stack: Extract<DetectedStack, { runtime: "python" }>): string {
  const lines: string[] = [];
  lines.push("FROM public.ecr.aws/docker/library/python:3.12-slim");
  lines.push("WORKDIR /app");
  lines.push("RUN pip install --no-cache-dir --upgrade pip");
  lines.push("COPY requirements.txt* pyproject.toml* Pipfile* ./");
  lines.push('RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; elif [ -f pyproject.toml ]; then pip install --no-cache-dir .; elif [ -f Pipfile ]; then pip install pipenv && pipenv install --system --deploy; fi');
  lines.push("COPY . .");

  if (stack.framework === "django") {
    lines.push("RUN python -c 'import django' 2>/dev/null || { " +
      "if grep -rq 'from django.conf.urls import url' . 2>/dev/null; then " +
      "pip install --no-cache-dir 'django>=3.2,<4.0'; " +
      "else pip install --no-cache-dir django; fi; }");
  } else if (stack.framework === "fastapi") {
    lines.push("RUN python -c 'import fastapi' 2>/dev/null || pip install --no-cache-dir fastapi");
  } else if (stack.framework === "flask") {
    lines.push("RUN python -c 'import flask' 2>/dev/null || pip install --no-cache-dir flask");
  }

  if (stack.framework === "django" || stack.framework === "flask") {
    lines.push("RUN pip install --no-cache-dir gunicorn");
  } else if (stack.framework === "fastapi") {
    lines.push("RUN pip install --no-cache-dir uvicorn[standard]");
  }

  lines.push("ENV PORT=8000");
  lines.push("EXPOSE 8000");

  if (stack.framework === "django") {
    lines.push('RUN WSGI_MOD=$(python -c "import pathlib; ws=[p.parent.name for p in pathlib.Path(\'.\').rglob(\'wsgi.py\') if p.parent.name != \'.\' ]; print(ws[0]+\'.wsgi:application\' if ws else \'config.wsgi:application\')" 2>/dev/null || echo "config.wsgi:application") && echo "$WSGI_MOD" > /tmp/wsgi_mod');
    lines.push('RUN python _deploy_patch.py 2>/dev/null || true');
    lines.push('RUN python manage.py collectstatic --noinput 2>/dev/null || true');
    lines.push('CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:8000 $(cat /tmp/wsgi_mod)"]');
  } else if (stack.framework === "fastapi") {
    lines.push('CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]');
  } else if (stack.framework === "flask") {
    lines.push('CMD ["gunicorn", "--bind", "0.0.0.0:8000", "app:app"]');
  } else {
    lines.push('CMD ["python", "main.py"]');
  }

  return lines.join("\n") + "\n";
}
