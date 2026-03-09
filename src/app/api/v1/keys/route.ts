import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getServiceClient } from "@/lib/db";
import { hashApiKey } from "@/lib/api-auth";
import { randomBytes } from "crypto";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, created_at, last_used_at, key_hash, is_active")
    .eq("user_id", session.user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 });
  }

  // Return masked keys (show prefix + last 4 chars of hash)
  const maskedKeys = (data || []).map((k) => ({
    id: k.id,
    name: k.name,
    created_at: k.created_at,
    last_used_at: k.last_used_at,
    masked_key: `expl_${"*".repeat(28)}${k.key_hash.slice(-4)}`,
  }));

  return NextResponse.json({ keys: maskedKeys });
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = (body.name as string)?.trim() || "My API Key";

  // Generate random key with prefix
  const rawBytes = randomBytes(32).toString("hex");
  const rawKey = `expl_${rawBytes}`;
  const keyHash = hashApiKey(rawKey);

  const supabase = getServiceClient();
  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      user_id: session.user.id,
      key_hash: keyHash,
      name,
    })
    .select("id, name, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
  }

  // Return raw key ONCE — never stored in plaintext
  return NextResponse.json({
    id: data.id,
    name: data.name,
    created_at: data.created_at,
    key: rawKey, // Only returned once
  });
}
