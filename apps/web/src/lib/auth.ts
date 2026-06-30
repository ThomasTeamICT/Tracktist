import NextAuth, { type NextAuthConfig } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import type { Provider } from "next-auth/providers";
import { prisma } from "./prisma.js";
import { env, features } from "./env.js";

/**
 * Auth.js / NextAuth v5 (brief §6.1, §9): email magic link + Google, with the
 * Prisma adapter and database sessions. Apple/Spotify can be added later behind
 * the same config. Secrets stay server-side.
 */
const providers: Provider[] = [];

if (features.google) {
  providers.push(
    Google({ clientId: env.GOOGLE_CLIENT_ID!, clientSecret: env.GOOGLE_CLIENT_SECRET! }),
  );
}
if (features.email) {
  providers.push(Nodemailer({ server: env.EMAIL_SERVER!, from: env.EMAIL_FROM! }));
}

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "database" },
  secret: env.AUTH_SECRET,
  trustHost: true,
  providers,
  pages: { signIn: "/login" },
  callbacks: {
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

/** The configured provider ids, for rendering the login page. */
export const enabledAuthProviders = {
  google: features.google,
  email: features.email,
} as const;
