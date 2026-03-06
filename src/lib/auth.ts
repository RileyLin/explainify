import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import type { NextAuthConfig } from "next-auth";

/**
 * NextAuth.js v5 configuration for Explainify.
 * 
 * Uses JWT strategy (no database adapter) to keep things simple.
 * User data is synced to Supabase `users` table via callbacks.
 */
export const authConfig: NextAuthConfig = {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async jwt({ token, user, account }) {
      // On initial sign-in, sync user to Supabase
      if (user && account) {
        token.provider = account.provider;
        token.providerAccountId = account.providerAccountId;

        // Sync to Supabase users table
        try {
          const { getServiceClient } = await import("@/lib/db");
          const supabase = getServiceClient();

          const { data: existingUser } = await supabase
            .from("users")
            .select("id")
            .eq("email", user.email!)
            .single();

          if (existingUser) {
            token.userId = existingUser.id;
            // Update user info
            await supabase
              .from("users")
              .update({
                name: user.name,
                avatar_url: user.image,
                updated_at: new Date().toISOString(),
              })
              .eq("id", existingUser.id);
          } else {
            const { data: newUser } = await supabase
              .from("users")
              .insert({
                email: user.email!,
                name: user.name,
                avatar_url: user.image,
                provider: account.provider,
                provider_id: account.providerAccountId,
              })
              .select("id")
              .single();

            if (newUser) {
              token.userId = newUser.id;
            }
          }
        } catch (err) {
          console.error("Error syncing user to Supabase:", err);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
  session: {
    strategy: "jwt",
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
