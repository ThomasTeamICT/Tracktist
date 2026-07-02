import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "./auth.js";

// cache(): the (app) layout and the page it wraps both ask for the user in the
// same request — memoize so the session is looked up once.
export const getCurrentUser = cache(async () => {
  const session = await auth();
  return session?.user ?? null;
});

/** Redirect to /login when unauthenticated; otherwise return the user. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
