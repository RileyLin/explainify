import { auth } from "@/lib/auth";

export default auth((req) => {
  const isAuth = !!req.auth;
  const { pathname } = req.nextUrl;

  // Protect /dashboard routes — redirect to sign-in if not authenticated
  if (pathname.startsWith("/dashboard") && !isAuth) {
    const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return Response.redirect(signInUrl);
  }
});

export const config = {
  // Only run middleware on dashboard routes
  matcher: ["/dashboard/:path*"],
};
