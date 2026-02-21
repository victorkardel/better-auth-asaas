import type { BetterAuthClientPlugin } from "better-auth/client";
import type { asaas } from "./plugin.js";

export const asaasClient = (): BetterAuthClientPlugin => {
  return {
    id: "asaas",
    $InferServerPlugin: {} as ReturnType<typeof asaas>,
  };
};
