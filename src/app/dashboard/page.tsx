import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getServiceClient } from "@/lib/db";
import type { ExplainerRow } from "@/lib/db";
import { DashboardClient } from "./dashboard-client";

export const metadata = {
  title: "Dashboard — Explainify",
  description: "Manage your explainers",
};

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/api/auth/signin?callbackUrl=/dashboard");
  }

  const supabase = getServiceClient();
  const { data: explainers, error } = await supabase
    .from("explainers")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });

  return (
    <DashboardClient
      explainers={(explainers as ExplainerRow[]) || []}
      userId={session.user.id}
    />
  );
}
