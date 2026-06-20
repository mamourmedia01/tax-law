import { describe, it, expect } from "vitest";
import { llmText, llmEnabled } from "../src/llm.js";
import { freshApp, registerCustomer } from "./helpers.js";
import request from "supertest";

describe("#9 grounded LLM seam", () => {
  it("is disabled and returns null when no ANTHROPIC_API_KEY is set", async () => {
    expect(llmEnabled()).toBe(false);
    const out = await llmText({ system: "x", user: "y" });
    expect(out).toBeNull();
  });

  it("concierge still answers (deterministic) and stays grounded without a key", async () => {
    const { app } = await freshApp();
    const c = await registerCustomer(app, "concierge@example.com");
    const r = await request(app).post("/api/concierge").set("Cookie", c.cookie).send({ message: "cheapest valet near me" });
    expect(r.status).toBe(200);
    expect(r.body.grounded).toBe(true);
    expect(r.body.model).toBe("sandbox:deterministic");
    expect(Array.isArray(r.body.references)).toBe(true);
    expect(typeof r.body.reply).toBe("string");
  });
});
