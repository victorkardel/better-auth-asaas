import { createAuthEndpoint } from "better-auth/api";
import type {
  AsaasEventHandlers,
  AsaasEventPayload,
  AsaasPaymentWebhookData,
  AsaasSubscriptionWebhookData,
} from "../types.js";
import type { AsaasClient } from "../asaas.js";

export const webhookEndpoint = (handlers: AsaasEventHandlers = {}, asaas?: AsaasClient, webhookSecret?: string) =>
  createAuthEndpoint(
    "/asaas/webhook",
    { method: "POST" },
    async (ctx) => {
      // Validate asaas-access-token header if a secret is configured
      if (webhookSecret) {
        const token = (ctx.request?.headers as Headers | undefined)?.get("asaas-access-token")
          ?? (ctx.headers as Record<string, string> | undefined)?.["asaas-access-token"];
        if (!token || token !== webhookSecret) {
          return ctx.json({ error: "Unauthorized" }, { status: 401 });
        }
      }

      const body = ctx.body as AsaasEventPayload;
      const { event, payment, subscription } = body;

      const payload: AsaasEventPayload = { event, payment, subscription };

      // Keep local subscription status in sync
      if (subscription) {
        const sub = subscription as AsaasSubscriptionWebhookData;
        if (sub.id && sub.status) {
          await ctx.context.adapter.update({
            model: "asaasSubscription",
            where: [{ field: "asaasId", value: sub.id }],
            update: { status: sub.status },
          });
        }
      }

      // Keep local payment status in sync
      if (payment) {
        const p = payment as AsaasPaymentWebhookData;
        if (p.id && p.status) {
          await ctx.context.adapter.update({
            model: "asaasPayment",
            where: [{ field: "asaasId", value: p.id }],
            update: { status: p.status },
          }).catch(() => { /* payment may not exist locally (e.g. subscription auto-charge) */ });
        }
      }

      // Route to the appropriate event handler
      try {
        switch (event) {
          case "PAYMENT_CREATED": {
            // For PIX payments, attach a fresh QR code so the handler can send it to the customer
            const enriched = { ...payload };
            if (asaas && payment) {
              const p = payment as AsaasPaymentWebhookData;
              if (p.billingType === "PIX" && p.id) {
                try { enriched.pixQrCode = await asaas.getPixQrCode(p.id); } catch { /* non-fatal */ }
              }
            }
            await handlers.onPaymentCreated?.(enriched);
            break;
          }

          case "PAYMENT_DUE_DATE_REMINDER": {
            const enriched = { ...payload };
            if (asaas && payment) {
              const p = payment as AsaasPaymentWebhookData;
              if (p.billingType === "PIX" && p.id) {
                try { enriched.pixQrCode = await asaas.getPixQrCode(p.id); } catch { /* non-fatal */ }
              }
            }
            await handlers.onPaymentDueSoon?.(enriched);
            break;
          }

          case "PAYMENT_OVERDUE": {
            // Fires on due date for unpaid charges, then every 7 days after
            if (payment) {
              const p = payment as AsaasPaymentWebhookData;
              const isToday = p.dueDate === new Date().toISOString().split("T")[0];
              if (isToday) {
                await handlers.onPaymentDue?.(payload);
              } else {
                await handlers.onPaymentOverdue?.(payload);
              }
            } else {
              await handlers.onPaymentOverdue?.(payload);
            }
            break;
          }

          case "PAYMENT_CONFIRMED":
          case "PAYMENT_RECEIVED":
            await handlers.onPaymentConfirmed?.(payload);
            break;

          case "PAYMENT_REFUNDED":
          case "PAYMENT_PARTIALLY_REFUNDED":
            await handlers.onPaymentRefunded?.(payload);
            break;

          case "PAYMENT_CHARGEBACK_REQUESTED":
          case "PAYMENT_CHARGEBACK_DISPUTE":
          case "PAYMENT_AWAITING_CHARGEBACK_REVERSAL":
            await handlers.onPaymentChargeback?.(payload);
            break;

          case "SUBSCRIPTION_CREATED":
            await handlers.onSubscriptionCreated?.(payload);
            break;

          case "SUBSCRIPTION_RENEWED":
            await handlers.onSubscriptionRenewed?.(payload);
            break;

          case "SUBSCRIPTION_DELETED":
            // Also update local record
            if (subscription) {
              const sub = subscription as AsaasSubscriptionWebhookData;
              if (sub.id) {
                await ctx.context.adapter.update({
                  model: "asaasSubscription",
                  where: [{ field: "asaasId", value: sub.id }],
                  update: { status: "INACTIVE" },
                }).catch(() => {});
              }
            }
            await handlers.onSubscriptionCanceled?.(payload);
            break;

          default:
            await handlers.onOtherEvent?.(payload);
        }
      } catch (err) {
        // Always return 200 so Asaas doesn't retry indefinitely
        ctx.context.logger.error("Error in Asaas event handler", err);
      }

      return ctx.json({ received: true });
    }
  );
