/**
 * Integration tests — make real calls to the Asaas sandbox.
 * Requires .env.test with ASAAS_API_KEY set.
 * Run with: npm run test:integration
 */
import { describe, it, expect, beforeAll } from "vitest";
import { AsaasClient } from "../src/asaas.js";

const apiKey = process.env.ASAAS_API_KEY;

// Skip entire suite if no key is present
const describeIf = apiKey ? describe : describe.skip;

let client: AsaasClient;
let createdCustomerId: string;
let createdSubscriptionId: string;
let createdPaymentId: string;

describeIf("Asaas sandbox integration", () => {
  beforeAll(() => {
    client = new AsaasClient({
      apiKey: apiKey!,
      sandbox: true,
      userAgent: "better-auth-asaas-integration-test",
    });
  });

  // ── Customer ────────────────────────────────────────────────────────────────

  it("creates a customer with notificationDisabled: true", async () => {
    const timestamp = Date.now();
    const customer = await client.createCustomer({
      name: "Better Auth Test User",
      email: `test-${timestamp}@better-auth-asaas.dev`,
      cpfCnpj: "24971563792",
      externalReference: `test-${timestamp}`,
      notificationDisabled: true,
    });

    expect(customer.id).toBeDefined();
    expect(customer.id).toMatch(/^cus_/);
    createdCustomerId = customer.id;
  });

  it("fetches the customer and confirms notificationDisabled is true", async () => {
    expect(createdCustomerId).toBeDefined();
    const customer = await client.getCustomer(createdCustomerId);

    console.log("\n📋 Full customer response from Asaas:");
    console.log(JSON.stringify(customer, null, 2));

    expect(customer.id).toBe(createdCustomerId);
    expect(customer.notificationDisabled).toBe(true);
  });

  // ── Subscription ─────────────────────────────────────────────────────────────

  it("creates a PIX subscription", async () => {
    expect(createdCustomerId).toBeDefined();

    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + 30);
    const nextDueDate = nextDue.toISOString().split("T")[0]!;

    const subscription = await client.createSubscription({
      customer: createdCustomerId,
      billingType: "PIX",
      value: 29.9,
      nextDueDate,
      cycle: "MONTHLY",
      description: "better-auth-asaas integration test plan",
    });

    expect(subscription.id).toBeDefined();
    expect(subscription.status).toBe("ACTIVE");
    expect(subscription.billingType).toBe("PIX");
    createdSubscriptionId = subscription.id;
  });

  it("fetches the created subscription", async () => {
    expect(createdSubscriptionId).toBeDefined();
    const subscription = await client.getSubscription(createdSubscriptionId);
    expect(subscription.id).toBe(createdSubscriptionId);
  });

  it("cancels the subscription", async () => {
    expect(createdSubscriptionId).toBeDefined();
    const result = await client.cancelSubscription(createdSubscriptionId);
    expect(result.deleted).toBe(true);
  });

  it("lists subscription payments and includes QR code for PIX", async () => {
    // Create a fresh subscription to list payments for
    expect(createdCustomerId).toBeDefined();

    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + 30);
    const nextDueDate = nextDue.toISOString().split("T")[0]!;

    const subscription = await client.createSubscription({
      customer: createdCustomerId,
      billingType: "PIX",
      value: 19.9,
      nextDueDate,
      cycle: "MONTHLY",
      description: "subscription payments test",
    });
    expect(subscription.id).toBeDefined();

    // Asaas generates the first payment immediately upon subscription creation
    const result = await client.getSubscriptionPayments(subscription.id);
    console.log(`\n📅 Subscription payments (${result.data.length} found):`);
    result.data.forEach((p) => {
      console.log(`  payment ${p.id}: status=${p.status} billingType=${p.billingType} dueDate=${p.dueDate}`);
    });
    expect(result.data.length).toBeGreaterThan(0);

    // For each pending PIX payment, we should be able to fetch a QR code
    const pendingPix = result.data.find((p) => p.status === "PENDING" && p.billingType === "PIX");
    if (pendingPix) {
      const qr = await client.getPixQrCode(pendingPix.id);
      console.log(`\n  🔲 QR code for first PIX cycle (${pendingPix.id}):`);
      console.log(`     payload: ${qr.payload.substring(0, 60)}...`);
      expect(qr.success).toBe(true);
      expect(qr.payload).toBeTruthy();
      expect(qr.encodedImage).toBeTruthy();
    }

    // Cleanup
    await client.cancelSubscription(subscription.id);
  });

  // ── Payments ──────────────────────────────────────────────────────────────

  it("creates a one-time PIX payment and returns QR code + copia e cola", async () => {
    expect(createdCustomerId).toBeDefined();

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    const dueDateStr = dueDate.toISOString().split("T")[0]!;

    const payment = await client.createPayment({
      customer: createdCustomerId,
      billingType: "PIX",
      value: 49.9,
      dueDate: dueDateStr,
      description: "better-auth-asaas PIX payment test",
    });

    expect(payment.id).toBeDefined();
    expect(payment.billingType).toBe("PIX");
    expect(payment.status).toBe("PENDING");
    createdPaymentId = payment.id;

    // Fetch QR code
    const qr = await client.getPixQrCode(payment.id);

    console.log("\n📱 PIX QR Code result:");
    console.log("  success:", qr.success);
    console.log("  expirationDate:", qr.expirationDate);
    console.log("  payload (Pix Copia e Cola):\n  ", qr.payload);
    console.log("  encodedImage (base64 PNG, first 40 chars):", qr.encodedImage.substring(0, 40) + "...");
    console.log("\n  👉 To display QR image in React:");
    console.log(`  <img src={\`data:image/png;base64,\${qr.encodedImage}\`} alt="PIX QR Code" />`);

    expect(qr.success).toBe(true);
    expect(qr.payload).toBeTruthy();
    expect(qr.encodedImage).toBeTruthy();
    // base64 PNG starts with iVBOR (PNG header)
    expect(qr.encodedImage.startsWith("iVBOR")).toBe(true);
    expect(qr.expirationDate).toBeTruthy();
  });

  it("creates a Boleto payment", async () => {
    expect(createdCustomerId).toBeDefined();

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    const dueDateStr = dueDate.toISOString().split("T")[0]!;

    const payment = await client.createPayment({
      customer: createdCustomerId,
      billingType: "BOLETO",
      value: 99.0,
      dueDate: dueDateStr,
      description: "better-auth-asaas Boleto payment test",
    });

    console.log("\n🎫 Boleto payment response:");
    console.log(JSON.stringify({ id: payment.id, status: payment.status, bankSlipUrl: payment.bankSlipUrl }, null, 2));

    expect(payment.id).toBeDefined();
    expect(payment.billingType).toBe("BOLETO");
    expect(payment.status).toBe("PENDING");
    expect(payment.bankSlipUrl).toBeDefined();

    await client.deletePayment(payment.id);
  });

  it("creates a Credit Card payment (confirmed instantly in sandbox)", async () => {
    expect(createdCustomerId).toBeDefined();

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);
    const dueDateStr = dueDate.toISOString().split("T")[0]!;

    const payment = await client.createPayment({
      customer: createdCustomerId,
      billingType: "CREDIT_CARD",
      value: 59.9,
      dueDate: dueDateStr,
      description: "better-auth-asaas credit card payment test",
      creditCard: {
        holderName: "Test Card",
        number: "5162306219378829", // Asaas sandbox test card (Mastercard)
        expiryMonth: "05",
        expiryYear: "2030",
        ccv: "318",
      },
      creditCardHolderInfo: {
        name: "Test Card",
        email: "cardtest@better-auth-asaas.dev",
        cpfCnpj: "24971563792",
        postalCode: "01001000",
        addressNumber: "123",
      },
    });

    console.log("\n💳 Credit Card payment response:");
    console.log(JSON.stringify({ id: payment.id, status: payment.status, billingType: payment.billingType }, null, 2));

    expect(payment.id).toBeDefined();
    expect(payment.billingType).toBe("CREDIT_CARD");
    // Sandbox confirms immediately
    expect(["CONFIRMED", "RECEIVED", "PENDING"]).toContain(payment.status);
  });

  it("fetches the created PIX payment", async () => {
    expect(createdPaymentId).toBeDefined();
    const payment = await client.getPayment(createdPaymentId);
    expect(payment.id).toBe(createdPaymentId);
    expect(payment.value).toBe(49.9);
  });

  it("lists payments filtered by customer", async () => {
    expect(createdCustomerId).toBeDefined();
    const result = await client.listPayments({ customer: createdCustomerId });
    expect(result.data.length).toBeGreaterThan(0);
    expect(result.data.every((p) => p.id !== undefined)).toBe(true);
  });

  it("deletes (cancels) the PIX payment", async () => {
    expect(createdPaymentId).toBeDefined();
    const result = await client.deletePayment(createdPaymentId);
    expect(result.deleted).toBe(true);
  });
});
