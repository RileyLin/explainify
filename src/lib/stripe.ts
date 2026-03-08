import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-02-25.clover",
  typescript: true,
});

/** Monthly Pro subscription price in cents */
export const PRO_PRICE_CENTS = 1500;

/** Stripe Price ID for Pro Monthly (test mode) */
export const PRO_PRICE_ID = "price_1T8pkSD9sSLIohn64PXSaKIk";

/** Product name */
export const PRO_PRODUCT_NAME = "Explainify Pro";
