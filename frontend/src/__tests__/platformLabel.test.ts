import { describe, expect, it } from "vitest";
import { platformLabel } from "../utils/platformLabel";

describe("platformLabel", () => {
  it("resolves every spelling of Nuxt to the product name", () => {
    expect(platformLabel("nuxt")).toBe("Nuxt");
    expect(platformLabel("nuxtjs")).toBe("Nuxt");
    expect(platformLabel("Nuxtjs")).toBe("Nuxt");
    expect(platformLabel("NuxtJS")).toBe("Nuxt");
    expect(platformLabel("nuxt.js")).toBe("Nuxt");
    expect(platformLabel("nuxt-js")).toBe("Nuxt");
  });

  it("keeps suffixes that belong to the real product name", () => {
    expect(platformLabel("nextjs")).toBe("Next.js");
    expect(platformLabel("next.js")).toBe("Next.js");
    expect(platformLabel("nestjs")).toBe("Nest.js");
    expect(platformLabel("nodejs")).toBe("Node.js");
    expect(platformLabel("sveltekit")).toBe("SvelteKit");
    expect(platformLabel("fastapi")).toBe("FastAPI");
    expect(platformLabel("spring-boot")).toBe("Spring Boot");
  });

  it("passes unknown values through unchanged", () => {
    expect(platformLabel("Phoenix")).toBe("Phoenix");
    expect(platformLabel("some-custom-stack")).toBe("some-custom-stack");
    expect(platformLabel("")).toBe("");
  });
});
