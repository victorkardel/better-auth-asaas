import type { AsaasClientOptions } from "./asaas.js";

// ─── Asaas webhook event types ───────────────────────────────────────────────

export type AsaasPaymentEvent =
  | "PAYMENT_CREATED"
  | "PAYMENT_UPDATED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_RECEIVED"
  | "PAYMENT_OVERDUE"
  | "PAYMENT_DELETED"
  | "PAYMENT_RESTORED"
  | "PAYMENT_REFUNDED"
  | "PAYMENT_PARTIALLY_REFUNDED"
  | "PAYMENT_CHARGEBACK_REQUESTED"
  | "PAYMENT_CHARGEBACK_DISPUTE"
  | "PAYMENT_AWAITING_CHARGEBACK_REVERSAL"
  | "PAYMENT_DUE_DATE_REMINDER";

export type AsaasSubscriptionEvent =
  | "SUBSCRIPTION_CREATED"
  | "SUBSCRIPTION_UPDATED"
  | "SUBSCRIPTION_DELETED"
  | "SUBSCRIPTION_RENEWED";

export type AsaasWebhookEventType = AsaasPaymentEvent | AsaasSubscriptionEvent | string;

export interface AsaasPaymentWebhookData {
  id: string;
  customer: string;
  value: number;
  netValue?: number;
  billingType: string;
  status: string;
  dueDate: string;
  description?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixQrCodeId?: string;
  externalReference?: string;
}

export interface AsaasSubscriptionWebhookData {
  id: string;
  customer: string;
  value: number;
  billingType: string;
  status: string;
  nextDueDate: string;
  cycle: string;
  description?: string;
  externalReference?: string;
}

/** Payload passed to event callbacks */
export interface AsaasEventPayload {
  event: AsaasWebhookEventType;
  payment?: AsaasPaymentWebhookData;
  subscription?: AsaasSubscriptionWebhookData;
  /** Present on PIX PAYMENT_CREATED and PAYMENT_DUE_DATE_REMINDER events */
  pixQrCode?: {
    encodedImage: string;  // base64 PNG — render as <img src={`data:image/png;base64,${encodedImage}`} />
    payload: string;       // Pix Copia e Cola — let user copy-paste into banking app
    expirationDate: string;
    success: boolean;
  };
}

/** @deprecated Use AsaasEventPayload */
export type AsaasNotificationPayload = AsaasEventPayload;

// ─── Event handlers ───────────────────────────────────────────────────────────

export interface AsaasEventHandlers {
  // ── Payment lifecycle ──────────────────────────────────────────────────────

  /**
   * A new charge was created. Fires for both one-time payments and
   * subscription cycle auto-generated charges.
   * 💡 Use to: send "here is your invoice" email. For PIX, pixQrCode is included.
   */
  onPaymentCreated?: (payload: AsaasEventPayload) => void | Promise<void>;

  /**
   * Payment is due soon (~10 days before due date).
   * 💡 Use to: send a friendly payment reminder. For PIX, pixQrCode is included.
   */
  onPaymentDueSoon?: (payload: AsaasEventPayload) => void | Promise<void>;

  /**
   * Payment is due today and still unpaid.
   * 💡 Use to: send an urgent reminder.
   */
  onPaymentDue?: (payload: AsaasEventPayload) => void | Promise<void>;

  /**
   * Payment is overdue. Fires on the day after due date, then every 7 days.
   * 💡 Use to: send dunning emails or pause access.
   */
  onPaymentOverdue?: (payload: AsaasEventPayload) => void | Promise<void>;

  /**
   * Payment was confirmed or received.
   * 💡 Use to: send a receipt, restore access, trigger onboarding.
   */
  onPaymentConfirmed?: (payload: AsaasEventPayload) => void | Promise<void>;

  /**
   * Payment was fully or partially refunded.
   * 💡 Use to: send refund confirmation, trigger win-back sequence.
   */
  onPaymentRefunded?: (payload: AsaasEventPayload) => void | Promise<void>;

  /**
   * A chargeback was requested or is under dispute.
   * 💡 Use to: alert your team, pause the account, reach out to the customer.
   */
  onPaymentChargeback?: (payload: AsaasEventPayload) => void | Promise<void>;

  // ── Subscription lifecycle ─────────────────────────────────────────────────

  /**
   * A new subscription was created.
   * 💡 Use to: send a welcome/onboarding email, start a nurture sequence.
   */
  onSubscriptionCreated?: (payload: AsaasEventPayload) => void | Promise<void>;

  /**
   * A subscription was renewed (new billing cycle started).
   * 💡 Use to: send a renewal confirmation.
   */
  onSubscriptionRenewed?: (payload: AsaasEventPayload) => void | Promise<void>;

  /**
   * A subscription was canceled or deleted.
   * 💡 Use to: trigger a win-back campaign, survey why they left, revoke access.
   */
  onSubscriptionCanceled?: (payload: AsaasEventPayload) => void | Promise<void>;

  /**
   * Catch-all handler — called for every webhook event not handled above.
   */
  onOtherEvent?: (payload: AsaasEventPayload) => void | Promise<void>;
}

/** @deprecated Use AsaasEventHandlers */
export type AsaasNotificationHandlers = AsaasEventHandlers;

// ─── Plugin options ───────────────────────────────────────────────────────────

export interface AsaasPluginOptions extends AsaasClientOptions {
  /**
   * Called after an Asaas customer is created on sign-up.
   * Useful for logging or additional setup.
   */
  onCustomerCreated?: (customerId: string, userId: string) => void | Promise<void>;

  /**
   * If true, skips auto-creating an Asaas customer on sign-up.
   */
  disableAutoCreateCustomer?: boolean;

  /**
   * If set, every incoming webhook request must include the header
   * `asaas-access-token: <webhookSecret>`. Requests that don't match
   * are rejected with 401. Set the same value in your Asaas dashboard
   * under Configurações → Notificações → Webhooks → Token de autenticação.
   */
  webhookSecret?: string;

  /**
   * Asaas customer group name to assign to every customer created by the plugin.
   *
   * Useful for multi-tenancy: each site/tenant gets its own group, so customers
   * with the same email are cleanly separated in the Asaas dashboard.
   * The group is created automatically by Asaas if it doesn't exist yet.
   *
   * Example: "my-saas-prod" or "tenant-acme"
   */
  customerGroupName?: string;

  /**
   * Handlers for Asaas billing events routed through the webhook endpoint.
   *
   * When provided, **ALL** Asaas-side customer notifications are disabled by default —
   * that includes Email, SMS, WhatsApp, Voice robot (robô de voz), and Correios.
   * This saves you the per-notification fees Asaas charges for each channel.
   * You receive the raw webhook events here and decide how to notify customers yourself.
   */
  events?: AsaasEventHandlers & {
    /**
     * Set to false to keep Asaas sending its own notifications through all channels
     * (Email, SMS, WhatsApp, Voice, Correios) in addition to firing your event handlers.
     * Default: true (all Asaas notifications disabled — you handle everything).
     */
    disableAsaasNotifications?: boolean;
  };

  /**
   * @deprecated Use `events` instead.
   */
  notifications?: AsaasEventHandlers & { disableAsaasNotifications?: boolean };
}

