import type { AsaasBillingType } from "./asaas.js";

export const asaasSchema = {
  user: {
    fields: {
      asaasCustomerId: {
        type: "string" as const,
        required: false,
        unique: true,
      },
    },
  },
  asaasSubscription: {
    fields: {
      userId: {
        type: "string" as const,
        required: true,
        references: {
          model: "user",
          field: "id",
          onDelete: "cascade" as const,
        },
      },
      asaasId: {
        type: "string" as const,
        required: true,
        unique: true,
      },
      status: {
        type: "string" as const,
        required: true,
      },
      billingType: {
        type: "string" as const,
        required: true,
      },
      value: {
        type: "number" as const,
        required: true,
      },
      nextDueDate: {
        type: "string" as const,
        required: true,
      },
      description: {
        type: "string" as const,
        required: false,
      },
      externalReference: {
        type: "string" as const,
        required: false,
      },
      trialEndsAt: {
        type: "string" as const,
        required: false,
      },
      createdAt: {
        type: "date" as const,
        required: true,
      },
      updatedAt: {
        type: "date" as const,
        required: true,
      },
    },
  },
  asaasPayment: {
    fields: {
      userId: {
        type: "string" as const,
        required: true,
        references: {
          model: "user",
          field: "id",
          onDelete: "cascade" as const,
        },
      },
      asaasId: {
        type: "string" as const,
        required: true,
        unique: true,
      },
      status: {
        type: "string" as const,
        required: true,
      },
      billingType: {
        type: "string" as const,
        required: true,
      },
      value: {
        type: "number" as const,
        required: true,
      },
      dueDate: {
        type: "string" as const,
        required: true,
      },
      description: {
        type: "string" as const,
        required: false,
      },
      invoiceUrl: {
        type: "string" as const,
        required: false,
      },
      bankSlipUrl: {
        type: "string" as const,
        required: false,
      },
      pixQrCodeId: {
        type: "string" as const,
        required: false,
      },
      externalReference: {
        type: "string" as const,
        required: false,
      },
      createdAt: {
        type: "date" as const,
        required: true,
      },
      updatedAt: {
        type: "date" as const,
        required: true,
      },
    },
  },
} as const;

export type AsaasSubscriptionRecord = {
  id: string;
  userId: string;
  asaasId: string;
  status: string;
  billingType: AsaasBillingType;
  value: number;
  nextDueDate: string;
  description?: string;
  externalReference?: string;
  trialEndsAt?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AsaasPaymentRecord = {
  id: string;
  userId: string;
  asaasId: string;
  status: string;
  billingType: AsaasBillingType;
  value: number;
  dueDate: string;
  description?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixQrCodeId?: string;
  externalReference?: string;
  createdAt: Date;
  updatedAt: Date;
};
