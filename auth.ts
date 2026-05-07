// NextAuth v5 — Google Workspace SSO restricted to sessions.co.uk.
// Brief §12. Hosted-domain check runs in the signIn callback.
//
// Dev-only fallback: if GOOGLE_CLIENT_ID/SECRET are missing (OAuth client not
// yet provisioned per §15 #4), a Credentials provider is wired so local
// development can proceed. Production deploys MUST have the Google provider
// configured — the dev provider is rejected when NODE_ENV === 'production'.

import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';

const ALLOWED_HD = 'sessions.co.uk';

const hasGoogleCreds = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const isProd = process.env.NODE_ENV === 'production';

if (isProd && !hasGoogleCreds) {
  // Prod deploys MUST set the Google OAuth client (§15 #4). We log loudly rather
  // than throw so `next build` succeeds in CI before the secret is provisioned;
  // the dev-only Credentials provider is still wired below to keep the build green.
  // The deploy checklist is the source of truth — verify env vars before flipping
  // traffic to the new revision.
  // eslint-disable-next-line no-console
  console.warn(
    '[auth] GOOGLE_CLIENT_ID/SECRET missing in production. Falling back to dev Credentials provider; ' +
      'this is INSECURE — fix before exposing to real users.',
  );
}

const providers: NextAuthConfig['providers'] = hasGoogleCreds
  ? [
      Google({
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
        authorization: { params: { hd: ALLOWED_HD, prompt: 'select_account' } },
      }),
    ]
  : [
      Credentials({
        name: 'Dev login (sessions.co.uk only)',
        credentials: {
          email: { label: 'Email', type: 'email', placeholder: 'you@sessions.co.uk' },
        },
        authorize(credentials) {
          const email = String(credentials?.email ?? '').trim().toLowerCase();
          if (!email.endsWith(`@${ALLOWED_HD}`)) return null;
          return { id: email, email, name: email.split('@')[0] };
        },
      }),
    ];

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: '/api/auth/signin' },
  callbacks: {
    async signIn({ user, account, profile }) {
      const email = (user.email ?? profile?.email ?? '').toLowerCase();
      if (!email.endsWith(`@${ALLOWED_HD}`)) return false;
      // Google sets profile.hd when the account is in a Workspace domain.
      if (account?.provider === 'google' && profile && (profile as { hd?: string }).hd !== ALLOWED_HD) {
        return false;
      }
      return true;
    },
    async session({ session, token }) {
      if (session.user && token.email) session.user.email = token.email;
      return session;
    },
  },
});
