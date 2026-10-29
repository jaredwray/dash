import type { AdapterColumn } from "@dash/core";

export const STRIPE_RESOURCES = {
  customers: [
    { name: "id", type: "string", nullable: false },
    { name: "email", type: "string", nullable: true },
    { name: "name", type: "string", nullable: true },
    { name: "created", type: "integer", nullable: false },
    { name: "currency", type: "string", nullable: true },
  ],
  charges: [
    { name: "id", type: "string", nullable: false },
    { name: "amount", type: "integer", nullable: false },
    { name: "currency", type: "string", nullable: false },
    { name: "status", type: "string", nullable: false },
    { name: "paid", type: "boolean", nullable: false },
    { name: "customer", type: "string", nullable: true },
    { name: "created", type: "integer", nullable: false },
  ],
  invoices: [
    { name: "id", type: "string", nullable: false },
    { name: "customer", type: "string", nullable: true },
    { name: "status", type: "string", nullable: false },
    { name: "currency", type: "string", nullable: false },
    { name: "total", type: "integer", nullable: false },
    { name: "created", type: "integer", nullable: false },
  ],
  subscriptions: [
    { name: "id", type: "string", nullable: false },
    { name: "customer", type: "string", nullable: true },
    { name: "status", type: "string", nullable: false },
    { name: "currency", type: "string", nullable: true },
    { name: "created", type: "integer", nullable: false },
  ],
} as const satisfies Record<string, readonly AdapterColumn[]>;

export type StripeResourceName = keyof typeof STRIPE_RESOURCES;

export const STRIPE_RESOURCE_NAMES = Object.keys(STRIPE_RESOURCES) as StripeResourceName[];

/**
 * Fields Stripe's Search query language accepts for each object.
 * `paid` is not searchable on charges; pattern filters stay local.
 */
export const STRIPE_SEARCH_FIELDS: Record<StripeResourceName, Readonly<Record<string, "string" | "number">>> = {
  customers: { email: "string", name: "string", created: "number" },
  charges: { amount: "number", currency: "string", customer: "string", status: "string", created: "number" },
  invoices: { customer: "string", status: "string", currency: "string", total: "number", created: "number" },
  subscriptions: { customer: "string", status: "string", created: "number" },
};

export function isStripeResource(value: string): value is StripeResourceName {
  return Object.prototype.hasOwnProperty.call(STRIPE_RESOURCES, value);
}
