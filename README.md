# better-auth-asaas

A [Better Auth](https://www.better-auth.com/) plugin that integrates with [Asaas](https://www.asaas.com/), the Brazilian payment gateway.

> **Currency:** Asaas operates exclusively in **BRL (Brazilian Reais, R$)**. All `value` fields throughout this plugin are in BRL.

## Features

- 🚀 **Auto-creates an Asaas customer** when a user signs up
- 🔗 **Links** `asaasCustomerId` to the user record automatically
- 💳 **Subscription management** — create & cancel subscriptions (Boleto, Pix, Credit Card)
- 🔔 **Webhook handler** — keeps local subscription status in sync with Asaas events
- 📬 **Billing event hooks** — disable ALL Asaas-side notifications (Email, SMS, WhatsApp, Voice robot, Correios) and handle everything yourself via any provider (Resend, SendGrid, Nodemailer…)
- 🔒 **Session-protected endpoints** — all billing actions require an authenticated session
- 🏖️ **Sandbox support** — test safely with your Asaas sandbox account

## Installation

```bash
npm install better-auth-asaas
```

## Setup

### Server

```ts
// auth.ts
import { betterAuth } from "better-auth";
import { asaas } from "better-auth-asaas";

export const auth = betterAuth({
  plugins: [
    asaas({
      apiKey: process.env.ASAAS_API_KEY!,
      sandbox: process.env.NODE_ENV !== "production",
      // Optional: group all customers under a named segment in Asaas
      // customerGroupName: "my-saas-prod",
    }),
  ],
});
```

### Client

```ts
// auth-client.ts
import { createAuthClient } from "better-auth/client";
import { asaasClient } from "better-auth-asaas/client";

export const authClient = createAuthClient({
  plugins: [asaasClient()],
});
```

### Database migration

Run Better Auth's migration to add the `asaasCustomerId` column to the `user` table and create the `asaasSubscription` and `asaasPayment` tables:

```bash
npx better-auth migrate
```

#### Using Drizzle or Prisma?

```bash
# Prisma
npx prisma migrate dev

# Drizzle
npx drizzle-kit push
```

#### Using ZenStack?

The plugin is ORM-agnostic — it goes through Better Auth's adapter API, so it works with any ORM Better Auth supports. The only requirement is that the tables exist in your database.

Add these models to your ZenStack schema file and run your migration:

```prisma
model User {
  // ... your existing fields
  asaasCustomerId      String?              @unique
  asaasSubscriptions   AsaasSubscription[]
  asaasPayments        AsaasPayment[]
}

model AsaasSubscription {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  asaasId           String   @unique
  status            String
  billingType       String
  value             Float
  nextDueDate       String
  description       String?
  externalReference String?
  trialEndsAt       String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  // Restrict access to the owner — adjust policies to fit your app
  @@allow('all', auth().id == userId)
  @@map("asaasSubscription")
}

model AsaasPayment {
  id                String   @id @default(cuid())
  userId            String
  user              User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  asaasId           String   @unique
  status            String
  billingType       String
  value             Float
  dueDate           String
  description       String?
  invoiceUrl        String?
  bankSlipUrl       String?
  pixQrCodeId       String?
  externalReference String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@allow('all', auth().id == userId)
  @@map("asaasPayment")
}
```

Then run your ZenStack/Prisma migration:

```bash
zenstack generate && npx prisma migrate dev
```

## Usage

### Get Asaas customer

```ts
const { data } = await authClient.asaas.getCustomer();
console.log(data.customer); // AsaasCustomer | null
```

### Create a subscription with a free trial

Pass `trialDays` instead of `nextDueDate` — the plugin computes the billing start date automatically. The subscription is **ACTIVE immediately**; Asaas simply won't generate the first charge until the trial ends.

```ts
const { data } = await authClient.asaas.subscriptionCreate({
  billingType: "PIX",
  value: 49.9,
  trialDays: 14,       // free for 14 days, then billed monthly
  cycle: "MONTHLY",
  description: "Pro plan (with trial)",
});
// data.trialEndsAt — date billing kicks in
```

### Create a subscription

> **Currency:** All `value` fields are in **BRL (Brazilian Reais, R$)**. Asaas is a Brazilian payment gateway and only operates in BRL.

```ts
const { data } = await authClient.asaas.subscriptionCreate({
  billingType: "PIX",
  value: 49.9,
  nextDueDate: "2026-03-01",
  cycle: "MONTHLY",
  description: "Pro plan",
});
```

### Cancel a subscription

```ts
await authClient.asaas.subscriptionCancel({
  subscriptionId: "sub_xxx",
});
```

### Webhook

The plugin registers a webhook endpoint at:

```
POST /api/auth/asaas/webhook
```

This is the URL Asaas will call to notify your app of billing events (payment confirmed, subscription canceled, etc.). You need to register it in your Asaas dashboard so events flow through.

**Step 1 — Register in Asaas dashboard**

Go to **Asaas → Configurações → Notificações → Webhooks** and add:

```
https://your-app.com/api/auth/asaas/webhook
```

Also set a **Token de autenticação** — Asaas will send it as the `asaas-access-token` header on every request. Pass it to the plugin as `webhookSecret` and the plugin will automatically reject any request that doesn't match:

```ts
asaas({
  apiKey: process.env.ASAAS_API_KEY!,
  webhookSecret: process.env.ASAAS_WEBHOOK_SECRET!, // must match what you set in Asaas dashboard
})
```

> ⚠️ Without a `webhookSecret`, anyone who knows your webhook URL can send fake events. Always set this in production.

> For local development use a tunnel like [ngrok](https://ngrok.com/) or [localtunnel](https://theboroer.github.io/localtunnel-www/):
> ```bash
> ngrok http 3000
> # then register: https://abc123.ngrok.io/api/auth/asaas/webhook
> ```

**Step 2 — Make sure the route is publicly accessible**

The webhook URL must be reachable by Asaas without authentication. Better Auth exposes all plugin endpoints under `/api/auth/...` — make sure your framework isn't adding auth middleware to that path.

**Step 3 — Handle events via the `events` option**

```ts
asaas({
  apiKey: process.env.ASAAS_API_KEY!,
  events: {
    onPaymentConfirmed: async ({ payment }) => {
      // grant access, send receipt, etc.
    },
    onSubscriptionCanceled: async ({ subscription }) => {
      // revoke access, trigger win-back email, etc.
    },
  },
})
```

Without any `events` handlers the webhook still works — it silently keeps your local `asaasSubscription` and `asaasPayment` table statuses in sync with Asaas.

## Billing event handlers

By default, **all** Asaas-side customer notifications are disabled on every customer created by this plugin — that includes Email, SMS, WhatsApp, Voice robot (robô de voz), and Correios. This saves you the per-notification fees Asaas charges for each channel.

You receive the raw webhook events via the `events` option and decide how to act on them (send emails, pause access, trigger CRM flows, etc.).

```ts
import { Resend } from "resend"; // or any provider

const resend = new Resend(process.env.RESEND_API_KEY);

export const auth = betterAuth({
  plugins: [
    asaas({
      apiKey: process.env.ASAAS_API_KEY!,
      sandbox: true,
      events: {
        // Set to false to re-enable Asaas-side notifications for all channels
        // disableAsaasNotifications: false,

        // ── Payment lifecycle ────────────────────────────────────────────────

        // New charge created. For PIX: pixQrCode (encodedImage + payload) is included.
        onPaymentCreated: async ({ payment, pixQrCode }) => {
          await resend.emails.send({
            from: "billing@myapp.com",
            to: "user@myapp.com", // look up from your DB using payment.customer
            subject: "New charge created",
            html: pixQrCode
              ? `<p>R$ ${payment!.value} — scan the PIX QR code below.</p>
                 <img src="data:image/png;base64,${pixQrCode.encodedImage}" />`
              : `<p>A new charge of R$ ${payment!.value} was created.</p>`,
          });
        },

        // ~10 days before due date. PIX QR code included if applicable.
        onPaymentDueSoon: async ({ payment }) => { /* send reminder */ },

        // Due today and still unpaid
        onPaymentDue: async ({ payment }) => { /* send urgent reminder */ },

        // Overdue — fires on due date +1 day, then every 7 days
        onPaymentOverdue: async ({ payment }) => { /* send dunning email, pause access */ },

        // Payment confirmed / received
        onPaymentConfirmed: async ({ payment }) => { /* send receipt, restore access */ },

        // Payment refunded
        onPaymentRefunded: async ({ payment }) => { /* send refund confirmation */ },

        // Chargeback requested or under dispute
        onPaymentChargeback: async ({ payment }) => { /* alert team, pause account */ },

        // ── Subscription lifecycle ───────────────────────────────────────────

        // New subscription created — great for onboarding / welcome sequence
        onSubscriptionCreated: async ({ subscription }) => { /* send welcome email */ },

        // Subscription renewed (new billing cycle auto-generated by Asaas)
        onSubscriptionRenewed: async ({ subscription }) => { /* send renewal confirmation */ },

        // Subscription canceled — trigger win-back campaign
        onSubscriptionCanceled: async ({ subscription }) => { /* send cancellation email, revoke access */ },

        // Catch-all for any Asaas event not handled above
        onOtherEvent: async ({ event }) => {
          console.log("Unhandled Asaas event:", event);
        },
      },
    }),
  ],
});
```

> **Asaas webhook events mapped:**
> | Handler | Asaas event(s) | When it fires |
> |---|---|---|
> | `onPaymentCreated` | `PAYMENT_CREATED` | New charge generated (one-time or subscription cycle) |
> | `onPaymentDueSoon` | `PAYMENT_DUE_DATE_REMINDER` | ~10 days before due date |
> | `onPaymentDue` | `PAYMENT_OVERDUE` (due today) | Due today, still unpaid |
> | `onPaymentOverdue` | `PAYMENT_OVERDUE` (past due) | Overdue — repeats every 7 days |
> | `onPaymentConfirmed` | `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` | Payment confirmed |
> | `onPaymentRefunded` | `PAYMENT_REFUNDED` / `PAYMENT_PARTIALLY_REFUNDED` | Refund issued |
> | `onPaymentChargeback` | `PAYMENT_CHARGEBACK_*` | Chargeback requested or in dispute |
> | `onSubscriptionCreated` | `SUBSCRIPTION_CREATED` | New subscription activated |
> | `onSubscriptionRenewed` | `SUBSCRIPTION_RENEWED` | New billing cycle started |
> | `onSubscriptionCanceled` | `SUBSCRIPTION_DELETED` | Subscription canceled |

## Plugin options

| Option | Type | Required | Description |
|---|---|---|---|
| `apiKey` | `string` | ✅ | Your Asaas API key |
| `sandbox` | `boolean` | | Use sandbox environment (default: `true`) |
| `userAgent` | `string` | | Value sent as `User-Agent` header (default: `"better-auth-asaas"`). Mandatory for Asaas accounts created after 06/11/2024. |
| `disableAutoCreateCustomer` | `boolean` | | Skip auto-creating customer on sign-up |
| `onCustomerCreated` | `(customerId, userId) => void` | | Callback after customer is created |
| `webhookSecret` | `string` | | Token set in Asaas dashboard (Token de autenticação). Plugin validates the `asaas-access-token` header and rejects unmatched requests with 401. |
| `customerGroupName` | `string` | | Asaas group name assigned to every customer on creation. Useful for multi-tenancy — customers with the same email stay separated per tenant/site. Asaas creates the group automatically if it doesn't exist. |
| `events` | `AsaasEventHandlers` | | Billing event handlers — see [Billing event handlers](#billing-event-handlers) |
| `events.disableAsaasNotifications` | `boolean` | | Disable ALL Asaas-side notifications — Email, SMS, WhatsApp, Voice, Correios (default: `true`) |

## License

MIT
