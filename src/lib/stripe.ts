import Stripe from "stripe";
import { requireEnv } from "@/lib/config";

let stripeClient: Stripe | null = null;
export function getStripe(): Stripe {
  if (!stripeClient) {
    stripeClient = new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
      apiVersion: "2026-02-25.clover",
      typescript: true,
    });
  }
  return stripeClient;
}

/** Monthly Pro subscription price in cents */
export const PRO_PRICE_CENTS = 900;

/** Stripe Price ID for Pro Monthly $9/mo (test mode) */
export const PRO_PRICE_ID = "price_1T8swuD9sSLIohn6Pnv3m45k";

/** Product name */
export const PRO_PRODUCT_NAME = "VizBrief Pro";
