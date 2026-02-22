import { describe, it, expect, vi, beforeEach } from "vitest";
import { AsaasClient } from "../src/asaas.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeJsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

describe("AsaasClient", () => {
  let client: AsaasClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new AsaasClient({ apiKey: "test-key", sandbox: true });
  });

  it("uses sandbox URL when sandbox=true", async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ id: "cus_1", name: "Test" }));
    await client.getCustomer("cus_1");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("api-sandbox.asaas.com"),
      expect.any(Object)
    );
  });

  it("uses production URL when sandbox=false", async () => {
    const prodClient = new AsaasClient({ apiKey: "test-key", sandbox: false });
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ id: "cus_1", name: "Test" }));
    await prodClient.getCustomer("cus_1");
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("api.asaas.com"),
      expect.any(Object)
    );
  });

  it("sends access_token header", async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ id: "cus_1" }));
    await client.getCustomer("cus_1");
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).get("access_token")).toBe("test-key");
  });

  it("sends User-Agent header (defaults to better-auth-asaas)", async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ id: "cus_1" }));
    await client.getCustomer("cus_1");
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).get("User-Agent")).toBe("better-auth-asaas");
  });

  it("sends custom User-Agent when provided", async () => {
    const customClient = new AsaasClient({ apiKey: "test-key", sandbox: true, userAgent: "my-app" });
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ id: "cus_1" }));
    await customClient.getCustomer("cus_1");
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Headers).get("User-Agent")).toBe("my-app");
  });

  it("createCustomer POSTs to /customers", async () => {
    const customer = { id: "cus_1", name: "João Silva", email: "joao@example.com" };
    mockFetch.mockResolvedValueOnce(makeJsonResponse(customer));

    const result = await client.createCustomer({ name: "João Silva", email: "joao@example.com" });
    expect(result).toEqual(customer);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/customers"),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("createSubscription POSTs to /subscriptions", async () => {
    const subscription = {
      id: "sub_1",
      customer: "cus_1",
      billingType: "PIX",
      value: 99.9,
      nextDueDate: "2026-03-01",
      cycle: "MONTHLY",
      status: "ACTIVE",
    };
    mockFetch.mockResolvedValueOnce(makeJsonResponse(subscription));

    const result = await client.createSubscription({
      customer: "cus_1",
      billingType: "PIX",
      value: 99.9,
      nextDueDate: "2026-03-01",
    });
    expect(result.id).toBe("sub_1");
  });

  it("cancelSubscription DELETEs /subscriptions/:id", async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ deleted: true, id: "sub_1" }));
    const result = await client.cancelSubscription("sub_1");
    expect(result.deleted).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/subscriptions/sub_1"),
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ errors: [] }, 400));
    await expect(client.getCustomer("bad")).rejects.toThrow("Asaas API error 400");
  });
});
