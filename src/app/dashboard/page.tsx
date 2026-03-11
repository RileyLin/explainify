import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getServiceClient } from "@/lib/db";
import type { ExplainerRow } from "@/lib/db";
import { DashboardClient } from "./dashboard-client";

export const metadata = {
  title: "Dashboard — VizBrief",
  description: "Manage your explainers",
};

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/api/auth/signin?callbackUrl=/dashboard");
  }

  const supabase = getServiceClient();
  const [{ data: explainers }, { data: user }] = await Promise.all([
    supabase
      .from("explainers")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("users")
      .select("plan")
      .eq("id", session.user.id)
      .single(),
  ]);

  return (
    <DashboardClient
      explainers={(explainers as ExplainerRow[]) || []}
      userId={session.user.id}
      plan={user?.plan ?? "free"}
    />
  );
}
