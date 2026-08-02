import { NextRequest, NextResponse } from "next/server";
import { configurationErrorPayload } from "@/lib/config";
import { getServiceClient } from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const supabase = getServiceClient();

    const { error } = await supabase
      .from("waitlist")
      .upsert({ email: normalizedEmail, source: "landing_page" }, { onConflict: "email" });

    if (error) {
      // If table doesn't exist yet, create it inline
      if (error.code === "42P01") {
        await supabase.rpc("exec_sql", {
          sql: `CREATE TABLE IF NOT EXISTS waitlist (
            id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
            email text UNIQUE NOT NULL,
            source text DEFAULT 'landing_page',
            created_at timestamptz DEFAULT now()
          );`,
        });
        await supabase.from("waitlist").upsert({ email: normalizedEmail, source: "landing_page" }, { onConflict: "email" });
      } else if (error.code !== "23505") {
        // 23505 = unique violation (already subscribed) — that's fine
        console.error("Waitlist insert error:", error);
        return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const configError = configurationErrorPayload(err);
    if (configError) {
      return NextResponse.json(configError, { status: 503 });
    }
    console.error("Waitlist error:", err);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
