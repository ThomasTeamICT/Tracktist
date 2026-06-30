import "server-only";
import { redirect } from "next/navigation";
import { auth } from "./auth.js";

export async function getCurrentUser() {
  const session = await auth();
  return session?.user ?? null;
}

/** Redirect to /login when unauthenticated; otherwise return the user. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
