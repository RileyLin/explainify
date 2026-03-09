import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getServiceClient } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getServiceClient();

  // Ownership check before delete
  const { data: existing } = await supabase
    .from("api_keys")
    .select("id, user_id")
    .eq("id", id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "API key not found" }, { status: 404 });
  }

  if (existing.user_id !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Soft delete — mark inactive
  const { error } = await supabase
    .from("api_keys")
    .update({ is_active: false })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to revoke API key" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
