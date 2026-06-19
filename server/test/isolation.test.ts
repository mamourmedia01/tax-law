import { describe, it, expect } from "vitest";
import request from "supertest";
import { freshApp, registerCustomer } from "./helpers.js";

async function book(app: ReturnType<typeof freshApp>["app"], cookie: string, slug = "jamies-mobile-valet", time = "10:00") {
  const provider = await request(app).get(`/api/providers/${slug}`);
  const serviceId = provider.body.services[0].id;
  return request(app)
    .post("/api/bookings")
    .set("Cookie", cookie)
    .send({ providerSlug: slug, serviceIds: [serviceId], date: "2030-01-15", time });
}

describe("tenant isolation (I7, I35, I36)", () => {
  it("Customer A cannot read Customer B's booking — returns not-found, never B's data", async () => {
    const { app } = freshApp();
    const a = await registerCustomer(app, "a@example.com");
    const b = await registerCustomer(app, "b@example.com");

    const bBooking = await book(app, b.cookie, "jamies-mobile-valet", "11:00");
    expect(bBooking.status).toBe(201);

    // A tries to read B's booking by id
    const asA = await request(app).get(`/api/bookings/${bBooking.body.id}`).set("Cookie", a.cookie);
    expect(asA.status).toBe(404);

    // A's own list never contains B's booking
    const aList = await request(app).get("/api/bookings").set("Cookie", a.cookie);
    expect(aList.body.find((x: { id: string }) => x.id === bBooking.body.id)).toBeUndefined();
  });

  it("a customer cannot reach the provider control plane", async () => {
    const { app } = freshApp();
    const a = await registerCustomer(app, "c@example.com");
    const res = await request(app).get("/api/provider/me").set("Cookie", a.cookie);
    expect(res.status).toBe(403);
  });

  it("a provider cannot pay another customer's booking (deny-by-default)", async () => {
    const { app } = freshApp();
    const a = await registerCustomer(app, "d@example.com");
    const booking = await book(app, a.cookie);
    const b = await registerCustomer(app, "e@example.com");
    const res = await request(app)
      .post(`/api/bookings/${booking.body.id}/pay`)
      .set("Cookie", b.cookie)
      .send({});
    expect(res.status).toBe(403);
  });
});
