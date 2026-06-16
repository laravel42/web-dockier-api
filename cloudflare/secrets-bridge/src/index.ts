interface Env {
  DOCKIER_ENV: string;
  BRIDGE_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    const auth = request.headers.get("Authorization");
    if (auth !== `Bearer ${env.BRIDGE_TOKEN}`) {
      return new Response("Unauthorized", { status: 401 });
    }

    try {
      const record = JSON.parse(env.DOCKIER_ENV) as Record<string, string>;
      return Response.json(record, {
        headers: { "Cache-Control": "no-store" },
      });
    } catch {
      return new Response("Invalid dockier-env secret payload", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
