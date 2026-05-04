import type { RepoConfig } from "../types";

export function generatePythonDockerfile(config: RepoConfig): string {
  const pyVer = config.pythonVersion || "3.12";
  const lines: string[] = [];

  lines.push(`FROM public.ecr.aws/docker/library/python:${pyVer}-slim`);
  lines.push("WORKDIR /app");
  lines.push("RUN pip install --no-cache-dir --upgrade pip");
  lines.push("COPY requirements.txt* pyproject.toml* Pipfile* ./");
  lines.push('RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; elif [ -f pyproject.toml ]; then pip install --no-cache-dir .; elif [ -f Pipfile ]; then pip install pipenv && pipenv install --system --deploy; fi');
  lines.push("COPY . .");

  // Ensure the framework itself is installed (projects may lack a dependency file)
  if (config.framework === "Django") {
    lines.push("RUN python -c 'import django' 2>/dev/null || { " +
      "if grep -rq 'from django.conf.urls import url' . 2>/dev/null; then " +
      "pip install --no-cache-dir 'django>=3.2,<4.0'; " +
      "else pip install --no-cache-dir django; fi; }");
  } else if (config.framework === "FastAPI") {
    lines.push("RUN python -c 'import fastapi' 2>/dev/null || pip install --no-cache-dir fastapi");
  } else if (config.framework === "Flask") {
    lines.push("RUN python -c 'import flask' 2>/dev/null || pip install --no-cache-dir flask");
  }

  // Ensure production server is installed
  if (config.framework === "Django" || config.framework === "Flask") {
    lines.push("RUN pip install --no-cache-dir gunicorn");
  } else if (config.framework === "FastAPI") {
    lines.push("RUN pip install --no-cache-dir uvicorn[standard]");
  }

  lines.push(`ENV PORT=${config.port}`);
  lines.push(`EXPOSE ${config.port}`);

  if (config.framework === "Django") {
    lines.push(`RUN WSGI_MOD=$(python -c "import pathlib; ws=[p.parent.name for p in pathlib.Path('.').rglob('wsgi.py') if p.parent.name != '.' ]; print(ws[0]+'.wsgi:application' if ws else 'config.wsgi:application')" 2>/dev/null || echo "config.wsgi:application") && echo "$WSGI_MOD" > /tmp/wsgi_mod`);
    lines.push('RUN python _deploy_patch.py 2>/dev/null || true');
    lines.push('RUN python manage.py collectstatic --noinput 2>/dev/null || true');
    lines.push(`CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${config.port} $(cat /tmp/wsgi_mod)"]`);
  } else if (config.framework === "FastAPI") {
    lines.push(`CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "${config.port}"]`);
  } else if (config.framework === "Flask") {
    lines.push(`CMD ["gunicorn", "--bind", "0.0.0.0:${config.port}", "app:app"]`);
  } else {
    lines.push(`CMD ["python", "main.py"]`);
  }

  return lines.join("\n") + "\n";
}
