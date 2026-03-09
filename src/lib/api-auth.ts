import { createHash } from "crypto";
import { getServiceClient } from "@/lib/db";

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function validateApiKey(
  key: string
): Promise<{ userId: string; keyId: string } | null> {
  const hash = hashApiKey(key);
  const supabase = getServiceClient();
  const { data } = await supabase
    .from("api_keys")
    .select("id, user_id, is_active")
    .eq("key_hash", hash)
    .single();
  if (!data?.is_active) return null;
  // Update last_used_at
  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);
  return { userId: data.user_id, keyId: data.id };
}
