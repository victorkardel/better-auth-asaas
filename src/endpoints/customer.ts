import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import type { AsaasClient } from "../asaas.js";

export const getCustomerEndpoint = (asaas: AsaasClient) =>
  createAuthEndpoint(
    "/asaas/customer",
    {
      method: "GET",
      use: [sessionMiddleware],
    },
    async (ctx) => {
      const { user } = ctx.context.session;
      const asaasCustomerId = (user as Record<string, unknown>).asaasCustomerId as string | undefined;

      if (!asaasCustomerId) {
        return ctx.json({ customer: null });
      }

      const customer = await asaas.getCustomer(asaasCustomerId);
      return ctx.json({ customer });
    }
  );
