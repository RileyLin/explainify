import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ApiKeysClient } from "./api-keys-client";

export const metadata = {
  title: "API Keys — Explainify",
  description: "Manage your Explainify API keys",
};

export default async function ApiKeysPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/auth/signin?callbackUrl=/settings/api-keys");
  }

  return <ApiKeysClient />;
}
