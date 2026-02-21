import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import * as z from "zod";
import type { AsaasClient } from "../asaas.js";

// ─── Shared schemas ───────────────────────────────────────────────────────────

const basePaymentSchema = z.object({
  value: z.number().positive(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "dueDate must be YYYY-MM-DD"),
  description: z.string().optional(),
  externalReference: z.string().optional(),
  discount: z
    .object({
      value: z.number(),
      dueDateLimitDays: z.number().optional(),
      type: z.enum(["FIXED", "PERCENTAGE"]).optional(),
    })
    .optional(),
  interest: z.object({ value: z.number() }).optional(),
  fine: z.object({ value: z.number() }).optional(),
});

const cardInfoSchema = z.object({
  holderName: z.string(),
  number: z.string(),
  expiryMonth: z.string(),
  expiryYear: z.string(),
  ccv: z.string(),
});

const cardHolderInfoSchema = z.object({
  name: z.string(),
  email: z.string(),
  cpfCnpj: z.string(),
  postalCode: z.string(),
  addressNumber: z.string(),
  phone: z.string().optional(),
});

const pixPaymentSchema = basePaymentSchema;

const boletoPaymentSchema = basePaymentSchema;

const creditCardPaymentSchema = basePaymentSchema.extend({
  creditCard: cardInfoSchema,
  creditCardHolderInfo: cardHolderInfoSchema,
  /** Number of installments (parcelas). If > 1, provide installmentValue too. */
  installmentCount: z.number().int().min(1).max(12).optional(),
  installmentValue: z.number().positive().optional(),
});

const deletePaymentSchema = z.object({
  paymentId: z.string(),
});

// ─── Shared persist helper ────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function persistPayment(
  ctx: { context: { adapter: { create: (args: any) => Promise<any> } } },
  userId: string,
  payment: {
    id: string; status: string; billingType: string; value: number; dueDate: string;
    description?: string; invoiceUrl?: string; bankSlipUrl?: string;
    pixQrCodeId?: string; externalReference?: string;
  },
  extra?: { description?: string; externalReference?: string }
) {
  await ctx.context.adapter.create({
    model: "asaasPayment",
    data: {
      userId,
      asaasId: payment.id,
      status: payment.status,
      billingType: payment.billingType,
      value: payment.value,
      dueDate: payment.dueDate,
      description: extra?.description ?? payment.description,
      invoiceUrl: payment.invoiceUrl,
      bankSlipUrl: payment.bankSlipUrl,
      pixQrCodeId: payment.pixQrCodeId,
      externalReference: extra?.externalReference ?? payment.externalReference,
    },
  });
}

// ─── PIX ──────────────────────────────────────────────────────────────────────

export const createPixPaymentEndpoint = (asaas: AsaasClient) =>
  createAuthEndpoint(
    "/asaas/payment/pix",
    { method: "POST", use: [sessionMiddleware], body: pixPaymentSchema },
    async (ctx) => {
      const { user } = ctx.context.session;
      const asaasCustomerId = (user as Record<string, unknown>).asaasCustomerId as string | undefined;
      if (!asaasCustomerId) {
        return ctx.json({ error: "No Asaas customer linked to this account." }, { status: 400 });
      }

      const payment = await asaas.createPayment({ customer: asaasCustomerId, billingType: "PIX", ...ctx.body });
      await persistPayment(ctx, user.id, payment, ctx.body);

      // Fetch QR code immediately so frontend doesn't need a second call
      const qrCode = await asaas.getPixQrCode(payment.id);

      return ctx.json({ payment, qrCode });
    }
  );

export const getPixQrCodeEndpoint = (asaas: AsaasClient) =>
  createAuthEndpoint(
    "/asaas/payment/pix-qr-code",
    {
      method: "GET",
      use: [sessionMiddleware],
      query: z.object({ paymentId: z.string() }),
    },
    async (ctx) => {
      const { user } = ctx.context.session;

      // Verify ownership
      const record = await ctx.context.adapter.findOne({
        model: "asaasPayment",
        where: [
          { field: "asaasId", value: ctx.query.paymentId },
          { field: "userId", value: user.id },
        ],
      });
      if (!record) return ctx.json({ error: "Payment not found." }, { status: 404 });

      const qrCode = await asaas.getPixQrCode(ctx.query.paymentId);
      return ctx.json({ qrCode });
    }
  );

// ─── Boleto ───────────────────────────────────────────────────────────────────

export const createBoletoPaymentEndpoint = (asaas: AsaasClient) =>
  createAuthEndpoint(
    "/asaas/payment/boleto",
    { method: "POST", use: [sessionMiddleware], body: boletoPaymentSchema },
    async (ctx) => {
      const { user } = ctx.context.session;
      const asaasCustomerId = (user as Record<string, unknown>).asaasCustomerId as string | undefined;
      if (!asaasCustomerId) {
        return ctx.json({ error: "No Asaas customer linked to this account." }, { status: 400 });
      }

      const payment = await asaas.createPayment({ customer: asaasCustomerId, billingType: "BOLETO", ...ctx.body });
      await persistPayment(ctx, user.id, payment, ctx.body);
      return ctx.json({ payment });
    }
  );

// ─── Credit Card ──────────────────────────────────────────────────────────────

export const createCreditCardPaymentEndpoint = (asaas: AsaasClient) =>
  createAuthEndpoint(
    "/asaas/payment/credit-card",
    { method: "POST", use: [sessionMiddleware], body: creditCardPaymentSchema },
    async (ctx) => {
      const { user } = ctx.context.session;
      const asaasCustomerId = (user as Record<string, unknown>).asaasCustomerId as string | undefined;
      if (!asaasCustomerId) {
        return ctx.json({ error: "No Asaas customer linked to this account." }, { status: 400 });
      }

      const payment = await asaas.createPayment({ customer: asaasCustomerId, billingType: "CREDIT_CARD", ...ctx.body });
      await persistPayment(ctx, user.id, payment, ctx.body);
      return ctx.json({ payment });
    }
  );

// ─── List & Delete (shared) ───────────────────────────────────────────────────

export const listPaymentsEndpoint = (asaas: AsaasClient) =>
  createAuthEndpoint(
    "/asaas/payment/list",
    { method: "GET", use: [sessionMiddleware] },
    async (ctx) => {
      const { user } = ctx.context.session;
      const asaasCustomerId = (user as Record<string, unknown>).asaasCustomerId as string | undefined;
      if (!asaasCustomerId) return ctx.json({ payments: [], totalCount: 0, hasMore: false });

      const result = await asaas.listPayments({ customer: asaasCustomerId });
      return ctx.json({ payments: result.data, totalCount: result.totalCount, hasMore: result.hasMore });
    }
  );

export const deletePaymentEndpoint = (asaas: AsaasClient) =>
  createAuthEndpoint(
    "/asaas/payment/delete",
    { method: "POST", use: [sessionMiddleware], body: deletePaymentSchema },
    async (ctx) => {
      const { user } = ctx.context.session;
      const { paymentId } = ctx.body;

      const record = await ctx.context.adapter.findOne({
        model: "asaasPayment",
        where: [
          { field: "asaasId", value: paymentId },
          { field: "userId", value: user.id },
        ],
      });
      if (!record) return ctx.json({ error: "Payment not found." }, { status: 404 });

      const result = await asaas.deletePayment(paymentId);
      await ctx.context.adapter.update({
        model: "asaasPayment",
        where: [{ field: "asaasId", value: paymentId }],
        update: { status: "DELETED" },
      });

      return ctx.json({ result });
    }
  );

// Keep the generic endpoint for backwards compatibility
export const createPaymentEndpoint = (asaas: AsaasClient) =>
  createAuthEndpoint(
    "/asaas/payment/create",
    {
      method: "POST",
      use: [sessionMiddleware],
      body: basePaymentSchema.extend({
        billingType: z.enum(["BOLETO", "CREDIT_CARD", "PIX"]),
      }),
    },
    async (ctx) => {
      const { user } = ctx.context.session;
      const asaasCustomerId = (user as Record<string, unknown>).asaasCustomerId as string | undefined;
      if (!asaasCustomerId) {
        return ctx.json({ error: "No Asaas customer linked to this account." }, { status: 400 });
      }

      const payment = await asaas.createPayment({ customer: asaasCustomerId, ...ctx.body });
      await persistPayment(ctx, user.id, payment, ctx.body);
      return ctx.json({ payment });
    }
  );



