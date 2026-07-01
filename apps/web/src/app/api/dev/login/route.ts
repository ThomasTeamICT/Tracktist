import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";

/**
 * DEV-ONLY one-click login as the seeded demo user, so the app is explorable
 * locally without configuring an OAuth/email provider. Disabled in production.
 *
 *   http://localhost:3000/api/dev/login   → logs in + redirects to the dashboard
 */
export async function GET(req: Request) {
  if (env.NODE_ENV === "production") {
    return NextResponse.json({ error: "dev login is disabled in production" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { email: "demo@tracktist.app" } });
  if (!user) {
    return NextResponse.json(
      { error: "No demo user found. Run `pnpm db:seed` (or `pnpm setup`) first." },
      { status: 404 },
    );
  }

  const token = crypto.randomUUID();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await prisma.session.create({ data: { sessionToken: token, userId: user.id, expires } });

  const res = NextResponse.redirect(new URL("/dashboard", req.url));
  // Non-secure cookie name matches Auth.js on http://localhost.
  res.cookies.set("authjs.session-token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    expires,
  });
  return res;
}
