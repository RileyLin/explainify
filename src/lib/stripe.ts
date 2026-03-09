import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-02-25.clover",
  typescript: true,
});

/** Monthly Pro subscription price in cents */
export const PRO_PRICE_CENTS = 900;

/** Stripe Price ID for Pro Monthly $9/mo (test mode) */
export const PRO_PRICE_ID = "price_1T8swuD9sSLIohn6Pnv3m45k";

/** Product name */
export const PRO_PRODUCT_NAME = "Explainify Pro";
