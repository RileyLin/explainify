import { NextRequest, NextResponse } from "next/server";
import { stripe, PRO_PRICE_ID } from "@/lib/stripe";
import { auth } from "@/lib/auth";
import { getServiceClient } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || !session?.user?.email) {
      return NextResponse.json(
        { error: "You must be signed in to upgrade" },
        { status: 401 },
      );
    }

    const userId = session.user.id;
    const email = session.user.email;
    const supabase = getServiceClient();

    // Check if user already has a Stripe customer ID
    const { data: user } = await supabase
      .from("users")
      .select("stripe_customer_id, plan")
      .eq("id", userId)
      .single();

    if (user?.plan === "pro") {
      return NextResponse.json(
        { error: "You are already on the Pro plan" },
        { status: 400 },
      );
    }

    let customerId = user?.stripe_customer_id;

    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        metadata: { userId },
      });
      customerId = customer.id;

      await supabase
        .from("users")
        .update({ stripe_customer_id: customerId })
        .eq("id", userId);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Create Checkout Session
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: PRO_PRICE_ID,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 30,
      },
      success_url: `${appUrl}/dashboard?upgraded=true`,
      cancel_url: `${appUrl}/pricing`,
      metadata: { userId },
      allow_promotion_codes: false,
    });

    if (checkoutSession.url) {
      return NextResponse.json({ url: checkoutSession.url });
    }

    return NextResponse.json(
      { error: "Failed to create checkout session" },
      { status: 500 },
    );
  } catch (error) {
    console.error("Stripe checkout error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
