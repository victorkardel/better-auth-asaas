// Asaas API base URLs
const ASAAS_SANDBOX_URL = "https://api-sandbox.asaas.com/v3";
const ASAAS_PRODUCTION_URL = "https://api.asaas.com/v3";

export interface AsaasClientOptions {
  apiKey: string;
  sandbox?: boolean;
  /** Sent as the User-Agent header. Required for accounts created after 06/11/2024. */
  userAgent?: string;
}

export interface AsaasCustomer {
  id: string;
  name: string;
  email: string;
  cpfCnpj?: string;
  phone?: string;
  mobilePhone?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  externalReference?: string;
  notificationDisabled?: boolean;
  /** Asaas customer group name — used to segment customers per tenant/site */
  groupName?: string;
}

export type AsaasCustomerInput = Omit<AsaasCustomer, "id">;

export type AsaasBillingType = "BOLETO" | "CREDIT_CARD" | "PIX" | "UNDEFINED";

export interface AsaasSubscriptionInput {
  customer: string; // Asaas customer ID
  billingType: AsaasBillingType;
  value: number;
  nextDueDate: string; // YYYY-MM-DD
  cycle?: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "BIMONTHLY" | "QUARTERLY" | "SEMIANNUALLY" | "YEARLY";
  description?: string;
  externalReference?: string;
  creditCard?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  creditCardHolderInfo?: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    phone?: string;
  };
}

export interface AsaasSubscription {
  id: string;
  customer: string;
  billingType: AsaasBillingType;
  value: number;
  nextDueDate: string;
  cycle: string;
  description?: string;
  status: "ACTIVE" | "INACTIVE" | "EXPIRED";
}

export interface AsaasPaymentInput {
  customer: string;
  billingType: AsaasBillingType;
  value: number;
  dueDate: string; // YYYY-MM-DD
  description?: string;
  externalReference?: string;
  installmentCount?: number;
  installmentValue?: number;
  discount?: {
    value: number;
    dueDateLimitDays?: number;
    type?: "FIXED" | "PERCENTAGE";
  };
  interest?: { value: number };
  fine?: { value: number };
  postalService?: boolean;
  creditCard?: {
    holderName: string;
    number: string;
    expiryMonth: string;
    expiryYear: string;
    ccv: string;
  };
  creditCardHolderInfo?: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    phone?: string;
  };
}

export interface AsaasPayment {
  id: string;
  customer: string;
  billingType: AsaasBillingType;
  value: number;
  netValue?: number;
  status: "PENDING" | "RECEIVED" | "CONFIRMED" | "OVERDUE" | "REFUNDED" | "RECEIVED_IN_CASH" | "REFUND_REQUESTED" | "CHARGEBACK_REQUESTED" | "CHARGEBACK_DISPUTE" | "AWAITING_CHARGEBACK_REVERSAL" | "DUNNING_REQUESTED" | "DUNNING_RECEIVED" | "AWAITING_RISK_ANALYSIS";
  dueDate: string;
  originalDueDate?: string;
  description?: string;
  externalReference?: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixQrCodeId?: string;
  pixTransaction?: string;
  deleted: boolean;
}

export interface AsaasWebhookEvent {
  event: string;
  payment?: Record<string, unknown>;
  subscription?: Record<string, unknown>;
}

export class AsaasClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly userAgent: string;

  constructor(options: AsaasClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.sandbox !== false ? ASAAS_SANDBOX_URL : ASAAS_PRODUCTION_URL;
    this.userAgent = options.userAgent ?? "better-auth-asaas";
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    // Build headers explicitly to ensure access_token is always present.
    // Spreading init.headers can silently drop it when headers is a Headers
    // instance (common in SSR / server-function environments).
    const headers = new Headers();
    headers.set("Content-Type", "application/json");
    headers.set("User-Agent", this.userAgent);
    headers.set("access_token", this.apiKey);
    if (init.headers) {
      new Headers(init.headers as ConstructorParameters<typeof Headers>[0]).forEach((v, k) => headers.set(k, v));
    }

    const res = await fetch(url, { ...init, headers });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Asaas API error ${res.status}: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  createCustomer(data: AsaasCustomerInput): Promise<AsaasCustomer> {
    return this.request<AsaasCustomer>("/customers", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  getCustomer(id: string): Promise<AsaasCustomer> {
    return this.request<AsaasCustomer>(`/customers/${id}`);
  }

  createSubscription(data: AsaasSubscriptionInput): Promise<AsaasSubscription> {
    return this.request<AsaasSubscription>("/subscriptions", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  cancelSubscription(id: string): Promise<{ deleted: boolean; id: string }> {
    return this.request<{ deleted: boolean; id: string }>(`/subscriptions/${id}`, {
      method: "DELETE",
    });
  }

  getSubscription(id: string): Promise<AsaasSubscription> {
    return this.request<AsaasSubscription>(`/subscriptions/${id}`);
  }

  /**
   * Lists all payments Asaas auto-generated for a subscription.
   * Each billing cycle produces one payment. For PIX, use getPixQrCode() on the PENDING one.
   */
  getSubscriptionPayments(subscriptionId: string, params?: { limit?: number; offset?: number }): Promise<{
    object: "list";
    hasMore: boolean;
    totalCount: number;
    limit: number;
    offset: number;
    data: AsaasPayment[];
  }> {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return this.request(`/subscriptions/${subscriptionId}/payments${query ? `?${query}` : ""}`);
  }

  listCustomers(params?: { limit?: number; offset?: number; name?: string; email?: string; externalReference?: string }): Promise<{
    object: "list";
    hasMore: boolean;
    totalCount: number;
    limit: number;
    offset: number;
    data: AsaasCustomer[];
  }> {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    if (params?.name) qs.set("name", params.name);
    if (params?.email) qs.set("email", params.email);
    if (params?.externalReference) qs.set("externalReference", params.externalReference);
    const query = qs.toString();
    return this.request(`/customers${query ? `?${query}` : ""}`);
  }

  deleteCustomer(id: string): Promise<{ deleted: boolean; id: string }> {
    return this.request<{ deleted: boolean; id: string }>(`/customers/${id}`, {
      method: "DELETE",
    });
  }

  createPayment(data: AsaasPaymentInput): Promise<AsaasPayment> {
    return this.request<AsaasPayment>("/payments", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  getPayment(id: string): Promise<AsaasPayment> {
    return this.request<AsaasPayment>(`/payments/${id}`);
  }

  listPayments(params?: { customer?: string; status?: string; billingType?: AsaasBillingType; limit?: number; offset?: number }): Promise<{
    object: "list";
    hasMore: boolean;
    totalCount: number;
    limit: number;
    offset: number;
    data: AsaasPayment[];
  }> {
    const qs = new URLSearchParams();
    if (params?.customer) qs.set("customer", params.customer);
    if (params?.status) qs.set("status", params.status);
    if (params?.billingType) qs.set("billingType", params.billingType);
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    const query = qs.toString();
    return this.request(`/payments${query ? `?${query}` : ""}`);
  }

  deletePayment(id: string): Promise<{ deleted: boolean; id: string }> {
    return this.request<{ deleted: boolean; id: string }>(`/payments/${id}`, {
      method: "DELETE",
    });
  }

  /** Returns both the base64 PNG QR code image and the Pix Copia e Cola payload string. */
  getPixQrCode(paymentId: string): Promise<{
    encodedImage: string;  // base64 PNG — render as <img src={`data:image/png;base64,${encodedImage}`} />
    payload: string;       // Pix Copia e Cola string — let user copy-paste into banking app
    expirationDate: string;
    success: boolean;
  }> {
    return this.request(`/payments/${paymentId}/pixQrCode`);
  }
}
