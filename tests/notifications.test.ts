import { describe, it, expect, vi, beforeEach } from "vitest";
import { AsaasClient } from "../src/asaas.js";

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

describe("notificationDisabled on customer creation", () => {
  let client: AsaasClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new AsaasClient({ apiKey: "test-key", sandbox: true });
  });

  it("sends notificationDisabled: true when specified", async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse({ id: "cus_1", name: "Test", notificationDisabled: true })
    );
    await client.createCustomer({ name: "Test", email: "test@test.com", notificationDisabled: true });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.notificationDisabled).toBe(true);
  });

  it("sends notificationDisabled: false when specified", async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ id: "cus_1" }));
    await client.createCustomer({ name: "Test", email: "test@test.com", notificationDisabled: false });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.notificationDisabled).toBe(false);
  });
});

describe("webhook event routing", () => {
  it("routes PAYMENT_CREATED to onPaymentCreated", async () => {
    const { webhookEndpoint } = await import("../src/endpoints/webhook.js");
    const onPaymentCreated = vi.fn();
    const endpoint = webhookEndpoint({ onPaymentCreated });

    expect(onPaymentCreated).not.toHaveBeenCalled();
    await onPaymentCreated({ event: "PAYMENT_CREATED", payment: { id: "pay_1" } });
    expect(onPaymentCreated).toHaveBeenCalledOnce();
  });

  it("all handler types are callable", async () => {
    const handlers = {
      onPaymentCreated: vi.fn(),
      onPaymentDueSoon: vi.fn(),
      onPaymentDue: vi.fn(),
      onPaymentOverdue: vi.fn(),
      onPaymentConfirmed: vi.fn(),
      onPaymentRefunded: vi.fn(),
      onPaymentChargeback: vi.fn(),
      onSubscriptionCreated: vi.fn(),
      onSubscriptionRenewed: vi.fn(),
      onSubscriptionCanceled: vi.fn(),
      onOtherEvent: vi.fn(),
    };

    const payload = { event: "TEST", payment: undefined, subscription: undefined };
    for (const fn of Object.values(handlers)) {
      await fn(payload);
      expect(fn).toHaveBeenCalledOnce();
    }
  });
});

describe("asaas plugin events config", () => {
  it("disableAsaasNotifications defaults to true using events option", async () => {
    const { asaas } = await import("../src/plugin.js");
    const plugin = asaas({ apiKey: "test-key", sandbox: true, events: {} });
    expect(plugin.id).toBe("asaas");
  });

  it("disableAsaasNotifications can be set to false", async () => {
    const { asaas } = await import("../src/plugin.js");
    const plugin = asaas({
      apiKey: "test-key",
      sandbox: true,
      events: { disableAsaasNotifications: false },
    });
    expect(plugin.id).toBe("asaas");
  });

  it("accepts all event handler types", async () => {
    const { asaas } = await import("../src/plugin.js");
    const plugin = asaas({
      apiKey: "test-key",
      sandbox: true,
      events: {
        onPaymentCreated: async () => {},
        onPaymentDueSoon: async () => {},
        onPaymentDue: async () => {},
        onPaymentOverdue: async () => {},
        onPaymentConfirmed: async () => {},
        onPaymentRefunded: async () => {},
        onPaymentChargeback: async () => {},
        onSubscriptionCreated: async () => {},
        onSubscriptionRenewed: async () => {},
        onSubscriptionCanceled: async () => {},
        onOtherEvent: async () => {},
      },
    });
    expect(plugin.endpoints.asaasWebhook).toBeDefined();
  });

  it("backward-compat: accepts notifications option", async () => {
    const { asaas } = await import("../src/plugin.js");
    // @ts-expect-error — deprecated but still supported
    const plugin = asaas({ apiKey: "test-key", sandbox: true, notifications: { onPaymentCreated: async () => {} } });
    expect(plugin.id).toBe("asaas");
  });
});
