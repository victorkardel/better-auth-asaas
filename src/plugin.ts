import type { BetterAuthPlugin } from "better-auth";
import { createAuthMiddleware } from "better-auth/plugins";
import { AsaasClient } from "./asaas.js";
import { asaasSchema } from "./schemas.js";
import { getCustomerEndpoint } from "./endpoints/customer.js";
import { createSubscriptionEndpoint, cancelSubscriptionEndpoint, getSubscriptionPaymentsEndpoint } from "./endpoints/subscription.js";
import { createPaymentEndpoint, createPixPaymentEndpoint, getPixQrCodeEndpoint, createBoletoPaymentEndpoint, createCreditCardPaymentEndpoint, listPaymentsEndpoint, deletePaymentEndpoint } from "./endpoints/payment.js";
import { webhookEndpoint } from "./endpoints/webhook.js";
import type { AsaasPluginOptions } from "./types.js";

export const asaas = (options: AsaasPluginOptions) => {
  const client = new AsaasClient({
    apiKey: options.apiKey,
    sandbox: options.sandbox,
    userAgent: options.userAgent,
  });

  // By default, disable ALL Asaas-side notifications (Email, SMS, WhatsApp, Voice, Correios)
  // so the plugin handles events instead, saving notification fees.
  const eventsConfig = options.events ?? options.notifications;
  const disableAsaasNotifications = eventsConfig?.disableAsaasNotifications !== false;

  return {
    id: "asaas",
    schema: asaasSchema,
    endpoints: {
      asaasGetCustomer: getCustomerEndpoint(client),
      asaasCreateSubscription: createSubscriptionEndpoint(client),
      asaasCancelSubscription: cancelSubscriptionEndpoint(client),
      asaasGetSubscriptionPayments: getSubscriptionPaymentsEndpoint(client),
      asaasCreatePayment: createPaymentEndpoint(client),
      asaasCreatePixPayment: createPixPaymentEndpoint(client),
      asaasGetPixQrCode: getPixQrCodeEndpoint(client),
      asaasCreateBoletoPayment: createBoletoPaymentEndpoint(client),
      asaasCreateCreditCardPayment: createCreditCardPaymentEndpoint(client),
      asaasListPayments: listPaymentsEndpoint(client),
      asaasDeletePayment: deletePaymentEndpoint(client),
      asaasWebhook: webhookEndpoint(eventsConfig ?? {}, client),
    },
    hooks: {
      after: [
        {
          matcher: (ctx) => ctx.path === "/sign-up/email",
          handler: createAuthMiddleware(async (ctx) => {
            if (options.disableAutoCreateCustomer) return;

            const newUser =
              ctx.context.newSession?.user ??
              (ctx as unknown as { returned?: { user?: { id: string; name: string; email: string } } })
                .returned?.user;
            if (!newUser) return;

            try {
              const customer = await client.createCustomer({
                name: newUser.name,
                email: newUser.email,
                externalReference: newUser.id,
                // Disable ALL Asaas-side notifications (Email, SMS, WhatsApp, Voice robot, Correios)
                // so the plugin routes events to your own handlers instead.
                notificationDisabled: disableAsaasNotifications,
              });

              await ctx.context.adapter.update({
                model: "user",
                where: [{ field: "id", value: newUser.id }],
                update: { asaasCustomerId: customer.id },
              });

              await options.onCustomerCreated?.(customer.id, newUser.id);
            } catch (err) {
              ctx.context.logger.error("Failed to create Asaas customer", err);
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;
};
