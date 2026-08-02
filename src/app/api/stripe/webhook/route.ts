import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { getServiceClient } from "@/lib/db";
import {
  configurationErrorPayload,
  requireEnv,
} from "@/lib/config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const sig = request.headers.get("stripe-signature");

    if (!sig) {
      return NextResponse.json({ error: "Missing signature" }, { status: 400 });
    }

    const webhookSecret = requireEnv("STRIPE_WEBHOOK_SECRET");
    const stripe = getStripe();

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const supabase = getServiceClient();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (userId) {
          await supabase
            .from("users")
            .update({
              plan: "pro",
              stripe_customer_id: customerId,
              stripe_subscription_id: subscriptionId,
            })
            .eq("id", userId);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;

        // Find user by stripe_customer_id and downgrade
        await supabase
          .from("users")
          .update({
            plan: "free",
            stripe_subscription_id: null,
          })
          .eq("stripe_customer_id", customerId);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;

        // If subscription is canceled or past_due, downgrade
        if (subscription.status === "canceled" || subscription.status === "unpaid") {
          await supabase
            .from("users")
            .update({ plan: "free" })
            .eq("stripe_customer_id", customerId);
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const configError = configurationErrorPayload(error);
    if (configError) {
      return NextResponse.json(configError, { status: 503 });
    }
    console.error("Stripe webhook error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
