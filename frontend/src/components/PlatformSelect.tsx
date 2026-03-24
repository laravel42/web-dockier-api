import { useState, useRef, useEffect } from "react";
import DevIcon from "./DevIcon";

interface Platform {
  name: string;
  slug: string;
  icon: string;
}

const PLATFORMS: Platform[] = [
  { name: "AIOHTTP", slug: "aiohttp", icon: "aiohttp" },
  { name: "Android", slug: "android", icon: "android" },
  { name: "Angular", slug: "angular", icon: "angular" },
  { name: "ASGI", slug: "asgi", icon: "python" },
  { name: "ASP.NET", slug: "aspnet", icon: "dotnet" },
  { name: "ASP.NET Core", slug: "aspnet-core", icon: "dotnet" },
  { name: "Astro", slug: "astro", icon: "astro" },
  { name: "AWS Lambda (.NET)", slug: "aws-lambda-dotnet", icon: "awslambda" },
  { name: "AWS Lambda (Node)", slug: "aws-lambda-node", icon: "awslambda" },
  { name: "AWS Lambda (Python)", slug: "aws-lambda-python", icon: "awslambda" },
  { name: "Azure Functions (Node)", slug: "azure-functions-node", icon: "azurefunctions" },
  { name: "Bottle", slug: "bottle", icon: "python" },
  { name: "Browser JavaScript", slug: "browser-js", icon: "javascript" },
  { name: "Bun", slug: "bun", icon: "bun" },
  { name: "Capacitor", slug: "capacitor", icon: "capacitor" },
  { name: "Celery", slug: "celery", icon: "celery" },
  { name: "Chalice", slug: "chalice", icon: "python" },
  { name: "Cloudflare Pages", slug: "cloudflare-pages", icon: "cloudflarepages" },
  { name: "Cloudflare Workers", slug: "cloudflare-workers", icon: "cloudflareworkers" },
  { name: "Connect", slug: "connect", icon: "nodedotjs" },
  { name: "Cordova", slug: "cordova", icon: "apachecordova" },
  { name: "Dart", slug: "dart", icon: "dart" },
  { name: "Deno", slug: "deno", icon: "deno" },
  { name: "Django", slug: "django", icon: "django" },
  { name: "Echo", slug: "echo", icon: "go" },
  { name: "Electron", slug: "electron", icon: "electron" },
  { name: "Elixir", slug: "elixir", icon: "elixir" },
  { name: "Ember", slug: "ember", icon: "emberdotjs" },
  { name: "Express", slug: "express", icon: "express" },
  { name: "Falcon", slug: "falcon", icon: "python" },
  { name: "FastAPI", slug: "fastapi", icon: "fastapi" },
  { name: "FastHTTP", slug: "fasthttp", icon: "go" },
  { name: "Fastify", slug: "fastify", icon: "fastify" },
  { name: "Fiber", slug: "fiber", icon: "go" },
  { name: "Flask", slug: "flask", icon: "flask" },
  { name: "Flutter", slug: "flutter", icon: "flutter" },
  { name: "Gatsby", slug: "gatsby", icon: "gatsby" },
  { name: "Gin", slug: "gin", icon: "go" },
  { name: "Go", slug: "go", icon: "go" },
  { name: "Godot", slug: "godot", icon: "godotengine" },
  { name: "Google Cloud Functions (.NET)", slug: "gcf-dotnet", icon: "googlecloud" },
  { name: "Google Cloud Functions (Node)", slug: "gcf-node", icon: "googlecloud" },
  { name: "Google Cloud Functions (Python)", slug: "gcf-python", icon: "googlecloud" },
  { name: "Hapi", slug: "hapi", icon: "hapi" },
  { name: "Hono", slug: "hono", icon: "hono" },
  { name: "Ionic", slug: "ionic", icon: "ionic" },
  { name: "iOS", slug: "ios", icon: "apple" },
  { name: "Iris", slug: "iris", icon: "go" },
  { name: "Java", slug: "java", icon: "openjdk" },
  { name: "Koa", slug: "koa", icon: "koa" },
  { name: "Kotlin", slug: "kotlin", icon: "kotlin" },
  { name: "Laravel", slug: "laravel", icon: "laravel" },
  { name: "Log4j 2.x", slug: "log4j", icon: "apache" },
  { name: "Logback", slug: "logback", icon: "openjdk" },
  { name: "macOS", slug: "macos", icon: "apple" },
  { name: "Minidump", slug: "minidump", icon: "cplusplus" },
  { name: "Native", slug: "native", icon: "c" },
  { name: "Negroni", slug: "negroni", icon: "go" },
  { name: "Nest.js", slug: "nestjs", icon: "nestjs" },
  { name: "Net/Http", slug: "net-http", icon: "go" },
  { name: "Next.js", slug: "nextjs", icon: "nextdotjs" },
  { name: "Node.js", slug: "nodejs", icon: "nodedotjs" },
  { name: "Nuxt", slug: "nuxt", icon: "nuxtdotjs" },
  { name: "PHP", slug: "php", icon: "php" },
  { name: "PowerShell", slug: "powershell", icon: "powershell" },
  { name: "Pyramid", slug: "pyramid", icon: "python" },
  { name: "Python", slug: "python", icon: "python" },
  { name: "Qt", slug: "qt", icon: "qt" },
  { name: "Quart", slug: "quart", icon: "python" },
  { name: "Rack Middleware", slug: "rack", icon: "ruby" },
  { name: "Rails", slug: "rails", icon: "rubyonrails" },
  { name: "React", slug: "react", icon: "react" },
  { name: "React Native", slug: "react-native", icon: "react" },
  { name: "React Router Framework", slug: "react-router", icon: "reactrouter" },
  { name: "Remix", slug: "remix", icon: "remix" },
  { name: "RQ (Redis Queue)", slug: "rq", icon: "redis" },
  { name: "Ruby", slug: "ruby", icon: "ruby" },
  { name: "Rust", slug: "rust", icon: "rust" },
  { name: "Sanic", slug: "sanic", icon: "python" },
  { name: "Serverless (Python)", slug: "serverless-python", icon: "serverless" },
  { name: "Solid", slug: "solid", icon: "solid" },
  { name: "SolidStart", slug: "solidstart", icon: "solid" },
  { name: "Spring", slug: "spring", icon: "spring" },
  { name: "Spring Boot", slug: "spring-boot", icon: "springboot" },
  { name: "Starlette", slug: "starlette", icon: "python" },
  { name: "Svelte", slug: "svelte", icon: "svelte" },
  { name: "SvelteKit", slug: "sveltekit", icon: "svelte" },
  { name: "Symfony", slug: "symfony", icon: "symfony" },
  { name: "TanStack Start React", slug: "tanstack-start", icon: "react" },
  { name: "Tornado", slug: "tornado", icon: "python" },
  { name: "Tryton", slug: "tryton", icon: "python" },
  { name: "Unity", slug: "unity", icon: "unity" },
  { name: "Unreal Engine", slug: "unreal", icon: "unrealengine" },
  { name: "Vue", slug: "vue", icon: "vuedotjs" },
  { name: "Windows Forms", slug: "winforms", icon: "dotnet" },
  { name: "WPF", slug: "wpf", icon: "dotnet" },
  { name: "WSGI", slug: "wsgi", icon: "python" },
  { name: "Xamarin", slug: "xamarin", icon: "xamarin" },
  { name: ".NET", slug: "dotnet", icon: "dotnet" },
];

interface Props {
  value: string;
  onChange: (slug: string) => void;
}

export default function PlatformSelect({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = PLATFORMS.find((p) => p.slug === value);

  const filtered = PLATFORMS.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full h-11 px-3 rounded-[var(--radius-input)] border border-border bg-card text-text text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 transition-colors flex items-center gap-2 cursor-pointer text-left"
      >
        {selected ? (
          <>
            <DevIcon
              src={selected.icon}
              alt=""
              className="w-4 h-4 shrink-0"
            />
            <span className="truncate">{selected.name}</span>
          </>
        ) : (
          <span className="text-text-muted">Select a platform…</span>
        )}
        <svg className="w-4 h-4 ml-auto shrink-0 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-card border border-border rounded-[var(--radius-input)] shadow-lg max-h-64 flex flex-col">
          <div className="p-2 border-b border-border">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search platforms…"
              className="w-full h-8 px-2 rounded bg-secondary-50 text-text text-sm outline-none focus:ring-1 focus:ring-primary-500/20"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-sm text-text-muted text-center">No platforms found</div>
            ) : (
              filtered.map((p) => (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => { onChange(p.slug); setOpen(false); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-secondary-50 transition-colors ${
                    value === p.slug ? "bg-primary-50 text-primary-600" : "text-text"
                  }`}
                >
                  <DevIcon
                    src={p.icon}
                    alt=""
                    className="w-4 h-4 shrink-0"
                  />
                  <span>{p.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
