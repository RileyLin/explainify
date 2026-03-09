import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getServiceClient } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ count: 0, limit: 5, plan: "free" });
    }

    const supabase = getServiceClient();
    const month = new Date().toISOString().slice(0, 7);

    const [usageResult, userResult] = await Promise.all([
      supabase
        .from("usage")
        .select("generations")
        .eq("user_id", session.user.id)
        .eq("month", month)
        .single(),
      supabase
        .from("users")
        .select("plan")
        .eq("id", session.user.id)
        .single(),
    ]);

    const count = usageResult.data?.generations ?? 0;
    const plan = userResult.data?.plan ?? "free";

    return NextResponse.json({ count, limit: 5, plan });
  } catch {
    return NextResponse.json({ count: 0, limit: 5, plan: "free" });
  }
}
