import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import * as z from "zod";
import type { AsaasClient } from "../asaas.js";

const billingTypeSchema = z.enum(["BOLETO", "CREDIT_CARD", "PIX", "UNDEFINED"]);

const createSubscriptionSchema = z.object({
  billingType: billingTypeSchema,
  value: z.number().positive(),
  /**
   * First billing date (YYYY-MM-DD). Ignored when trialDays is set.
   * Defaults to today when trialDays is provided.
   */
  nextDueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /**
   * Number of free trial days before the first charge.
   * Sets nextDueDate to today + trialDays automatically.
   * The subscription is ACTIVE immediately — billing just starts later.
   */
  trialDays: z.number().int().positive().optional(),
  cycle: z
    .enum(["WEEKLY", "BIWEEKLY", "MONTHLY", "BIMONTHLY", "QUARTERLY", "SEMIANNUALLY", "YEARLY"])
    .optional(),
  description: z.string().optional(),
  externalReference: z.string().optional(),
  creditCard: z
    .object({
      holderName: z.string(),
      number: z.string(),
      expiryMonth: z.string(),
      expiryYear: z.string(),
      ccv: z.string(),
    })
    .optional(),
  creditCardHolderInfo: z
    .object({
      name: z.string(),
      email: z.string(),
      cpfCnpj: z.string(),
      postalCode: z.string(),
      addressNumber: z.string(),
      phone: z.string().optional(),
    })
    .optional(),
});

const cancelSubscriptionSchema = z.object({
  subscriptionId: z.string(),
});

export const createSubscriptionEndpoint = (asaas: AsaasClient) =>
  createAuthEndpoint(
    "/asaas/subscription/create",
    {
      method: "POST",
      use: [sessionMiddleware],
      body: createSubscriptionSchema,
    },
    async (ctx) => {
      const { user } = ctx.context.session;
      const asaasCustomerId = (user as Record<string, unknown>).asaasCustomerId as string | undefined;

      if (!asaasCustomerId) {
        return ctx.json(
          { error: "No Asaas customer linked to this account." },
          { status: 400 }
        );
      }

      // trialDays overrides nextDueDate — billing starts after the trial period
      const { trialDays, nextDueDate, ...rest } = ctx.body;
      if (!trialDays && !nextDueDate) {
        return ctx.json({ error: "Provide either nextDueDate or trialDays." }, { status: 400 });
      }
      let billingStartDate = nextDueDate!;
      let trialEndsAt: string | undefined;
      if (trialDays) {
        const d = new Date();
        d.setDate(d.getDate() + trialDays);
        billingStartDate = d.toISOString().split("T")[0]!;
        trialEndsAt = billingStartDate;
      }

      const subscription = await asaas.createSubscription({
        customer: asaasCustomerId,
        ...rest,
        nextDueDate: billingStartDate,
      });

      // Persist to local asaasSubscription table
      await ctx.context.adapter.create({
        model: "asaasSubscription",
        data: {
          userId: user.id,
          asaasId: subscription.id,
          status: subscription.status,
          billingType: subscription.billingType,
          value: subscription.value,
          nextDueDate: subscription.nextDueDate,
          description: rest.description,
          externalReference: rest.externalReference,
          ...(trialEndsAt ? { trialEndsAt } : {}),
        },
      });

      return ctx.json({ subscription, ...(trialEndsAt ? { trialEndsAt } : {}) });
    }
  );

export const cancelSubscriptionEndpoint = (asaas: AsaasClient) =>
  createAuthEndpoint(
    "/asaas/subscription/cancel",
    {
      method: "POST",
      use: [sessionMiddleware],
      body: cancelSubscriptionSchema,
    },
    async (ctx) => {
      const { user } = ctx.context.session;
      const { subscriptionId } = ctx.body;

      // Verify the subscription belongs to this user
      const record = await ctx.context.adapter.findOne({
        model: "asaasSubscription",
        where: [
          { field: "asaasId", value: subscriptionId },
          { field: "userId", value: user.id },
        ],
      });

      if (!record) {
        return ctx.json({ error: "Subscription not found." }, { status: 404 });
      }

      const result = await asaas.cancelSubscription(subscriptionId);

      // Update local record status
      await ctx.context.adapter.update({
        model: "asaasSubscription",
        where: [{ field: "asaasId", value: subscriptionId }],
        update: { status: "INACTIVE" },
      });

      return ctx.json({ result });
    }
  );

/**
 * GET /asaas/subscription/payments?subscriptionId=sub_xxx
 *
 * Lists all payments Asaas auto-generated for a subscription.
 * For PIX subscriptions, each pending payment includes a fresh QR code (encodedImage + payload).
 * For Credit Card, Asaas auto-charges — no QR code needed.
 * For Boleto, each payment includes a bankSlipUrl.
 */
export const getSubscriptionPaymentsEndpoint = (asaas: AsaasClient) =>
  createAuthEndpoint(
    "/asaas/subscription/payments",
    {
      method: "GET",
      use: [sessionMiddleware],
      query: z.object({ subscriptionId: z.string() }),
    },
    async (ctx) => {
      const { user } = ctx.context.session;
      const { subscriptionId } = ctx.query;

      // Verify the subscription belongs to this user
      const record = await ctx.context.adapter.findOne({
        model: "asaasSubscription",
        where: [
          { field: "asaasId", value: subscriptionId },
          { field: "userId", value: user.id },
        ],
      });
      if (!record) return ctx.json({ error: "Subscription not found." }, { status: 404 });

      const result = await asaas.getSubscriptionPayments(subscriptionId);

      // For PIX subscriptions: attach a fresh QR code to every PENDING payment
      const paymentsWithQr = await Promise.all(
        result.data.map(async (payment) => {
          if (payment.billingType === "PIX" && payment.status === "PENDING") {
            const qrCode = await asaas.getPixQrCode(payment.id);
            return { ...payment, qrCode };
          }
          return payment;
        })
      );

      return ctx.json({
        payments: paymentsWithQr,
        totalCount: result.totalCount,
        hasMore: result.hasMore,
      });
    }
  );
