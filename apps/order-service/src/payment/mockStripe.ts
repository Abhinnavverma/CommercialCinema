import { randomUUID } from "node:crypto";
import { PAYMENT_LATENCY_MS, PAYMENT_SUCCESS_RATE } from "../static/index.js";

export type PaymentResult =
  | { success: true; paymentRef: string }
  | { success: false; reason: string };

// The function shape the Order Service depends on. Injecting it (rather than importing
// chargePayment directly into the controller) lets unit tests deterministically force
// an approval or a decline without waiting on the random gateway.
export type PaymentGateway = (amountCents: number) => Promise<PaymentResult>;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mock Stripe: simulates a 500ms processor round-trip, then randomly approves or
// declines. It only ever resolves (never rejects) for a declined charge; a rejection
// is reserved for a genuine gateway/transport failure, which the controller maps to 500.
export const chargePayment: PaymentGateway = async (amountCents) => {
  await delay(PAYMENT_LATENCY_MS);

  if (Math.random() < PAYMENT_SUCCESS_RATE) {
    return { success: true, paymentRef: `pay_${randomUUID()}` };
  }

  return { success: false, reason: `Card declined for amount ${amountCents}` };
};
