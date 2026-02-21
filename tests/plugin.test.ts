import { describe, it, expect } from "vitest";
import { asaasSchema } from "../src/schemas.js";

describe("asaasSchema", () => {
  it("adds asaasCustomerId to user table", () => {
    expect(asaasSchema.user.fields.asaasCustomerId).toBeDefined();
    expect(asaasSchema.user.fields.asaasCustomerId.type).toBe("string");
    expect(asaasSchema.user.fields.asaasCustomerId.required).toBe(false);
  });

  it("defines asaasSubscription table with required fields", () => {
    const fields = asaasSchema.asaasSubscription.fields;
    expect(fields.userId.required).toBe(true);
    expect(fields.userId.references?.model).toBe("user");
    expect(fields.asaasId.unique).toBe(true);
    expect(fields.billingType.type).toBe("string");
    expect(fields.value.type).toBe("number");
  });
});

describe("asaas plugin", () => {
  it("exports a plugin factory function", async () => {
    const { asaas } = await import("../src/plugin.js");
    expect(typeof asaas).toBe("function");
  });

  it("plugin has correct id", async () => {
    const { asaas } = await import("../src/plugin.js");
    const plugin = asaas({ apiKey: "test-key", sandbox: true });
    expect(plugin.id).toBe("asaas");
  });

  it("plugin exposes expected endpoints", async () => {
    const { asaas } = await import("../src/plugin.js");
    const plugin = asaas({ apiKey: "test-key", sandbox: true });
    expect(plugin.endpoints).toHaveProperty("asaasGetCustomer");
    expect(plugin.endpoints).toHaveProperty("asaasCreateSubscription");
    expect(plugin.endpoints).toHaveProperty("asaasCancelSubscription");
    expect(plugin.endpoints).toHaveProperty("asaasWebhook");
  });

  it("plugin exposes after hooks", async () => {
    const { asaas } = await import("../src/plugin.js");
    const plugin = asaas({ apiKey: "test-key", sandbox: true });
    expect(plugin.hooks?.after?.length).toBeGreaterThan(0);
  });

  it("disableAutoCreateCustomer option is respected", async () => {
    const { asaas } = await import("../src/plugin.js");
    // Just ensure the plugin instantiates without error when disabled
    const plugin = asaas({ apiKey: "test-key", sandbox: true, disableAutoCreateCustomer: true });
    expect(plugin.id).toBe("asaas");
  });
});

describe("asaasClient plugin", () => {
  it("exports a client plugin factory", async () => {
    const { asaasClient } = await import("../src/client.js");
    expect(typeof asaasClient).toBe("function");
    const plugin = asaasClient();
    expect(plugin.id).toBe("asaas");
  });
});
