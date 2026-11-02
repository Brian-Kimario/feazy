'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, Hammer, Home } from 'lucide-react';
import {
  signInWithEmail,
  signInWithGoogle,
  type SignInAudience,
  type SignInFailure,
} from '@/app/auth/actions';
import { AuthShell, GoogleIcon, authInput } from '@/components/auth/auth-shell';
import { TAGLINES } from '@/lib/brand';
import { PasswordField } from '@/components/ui/PasswordField';

const COPY: Record<
  SignInAudience,
  {
    label: string;
    heading: string;
    sub: string;
    registerHref: string;
    registerText: string;
    registerCta: string;
  }
> = {
  customer: {
    label: 'I need a service',
    heading: TAGLINES.customerSignIn,
    sub: TAGLINES.customerSignInSub,
    registerHref: '/auth/register',
    registerText: 'New to Feazy?',
    registerCta: 'Create a customer account',
  },
  professional: {
    label: 'I’m a professional',
    heading: TAGLINES.professionalSignIn,
    sub: TAGLINES.professionalSignInSub,
    registerHref: '/auth/register/professional',
    registerText: 'Not on Feazy yet?',
    registerCta: 'Apply as a professional',
  },
};

export function LoginPageClient() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const requested = searchParams.get('as') ?? searchParams.get('role');
  const [audience, setAudience] = useState<SignInAudience>(requested === 'professional' ? 'professional' : 'customer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [failure, setFailure] = useState<SignInFailure | null>(null);
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const isLoggedOut = ['1', 'true'].includes(searchParams.get('logged_out') ?? '');
  const registered = searchParams.get('registered') === 'true';
  const sessionExpired = searchParams.get('reason') === 'session_expired';

  const copy = COPY[audience];
  const isPro = audience === 'professional';
  // Only carry `next` across the audience switch when it still makes sense there.
  const nextForAudience = next && next.startsWith(`/${audience}`) ? next : null;

  const switchAudience = (to: SignInAudience) => {
    if (to === audience || isLoading) return;
    setAudience(to);
    setFailure(null);
    setGoogleError(null);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('role');
    params.set('as', to);
    if (next && !next.startsWith(`/${to}`)) params.delete('next');
    window.history.replaceState(null, '', `/auth/login?${params.toString()}`);
  };

  const handleEmailSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFailure(null);
    setEmailError(null);
    setPasswordError(null);
    if (!email.trim()) setEmailError('Enter the email address on your account.');
    if (!password) setPasswordError('Enter your password to continue.');
    if (!email.trim() || !password) return;
    setIsLoading(true);
    try {
      // On success the server action redirects (NEXT_REDIRECT) and never returns.
      const result = await signInWithEmail(email, password, nextForAudience, audience);
      setFailure(result);
      setIsLoading(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('NEXT_REDIRECT')) return;
      setFailure({ ok: false, code: 'unknown', message: 'We could not sign you in right now. Please try again.' });
      setIsLoading(false);
    }
    // Keep the spinner on success while Next navigates.
  };

  const handleGoogleSignIn = async () => {
    setFailure(null);
    setGoogleError(null);
    setIsLoading(true);
    try {
      const result = await signInWithGoogle(nextForAudience);
      if (result?.url) {
        window.location.assign(result.url);
        return;
      }
      setGoogleError('Google sign-in could not be started. Please use email instead.');
    } catch {
      setGoogleError('Google sign-in could not be started. Please try again.');
    }
    setIsLoading(false);
  };

  const inputCls = authInput;

  return (
    <AuthShell audience={audience}>
          {/* Audience switch */}
          <div role="group" aria-label="Sign in as" className="grid grid-cols-2 gap-1 rounded-2xl border border-line-strong bg-paper-2 p-1">
            {(['customer', 'professional'] as const).map((a) => {
              const active = a === audience;
              const Icon = a === 'customer' ? Home : Hammer;
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={active}
                  onClick={() => switchAudience(a)}
                  className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-2 text-[13.5px] font-semibold transition-colors ${
                    active ? (a === 'professional' ? 'bg-ink text-porcelain shadow-sm' : 'bg-teal text-paper shadow-sm') : 'text-ink-3 hover:text-ink'
                  }`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {COPY[a].label}
                </button>
              );
            })}
          </div>

          <h1 className="mt-9 font-editorial text-[clamp(34px,5vw,44px)] font-normal leading-[1.05] tracking-[-0.02em]">{copy.heading}</h1>
          <p className="mt-2 text-[15px] text-ink-3">{copy.sub}</p>

          {isLoggedOut && !failure && (
            <p role="status" className="mt-6 rounded-xl bg-teal-wash px-4 py-3 text-[14px] text-teal-deep">You’re signed out. Sign in to continue.</p>
          )}
          {registered && !failure && (
            <p role="status" className="mt-6 rounded-xl bg-teal-wash px-4 py-3 text-[14px] text-teal-deep">Account created. Check your email to confirm it, then sign in.</p>
          )}
          {sessionExpired && !failure && (
            <p role="status" className="mt-6 rounded-xl bg-ochre-soft px-4 py-3 text-[14px] text-ochre">Your session expired. Please sign in again.</p>
          )}
          {failure && (
            <div role="alert" className="mt-6 rounded-xl border border-clay/30 bg-clay/10 px-4 py-3 text-[14px] text-clay">
              <p>{failure.message}</p>
              {failure.code === 'wrong_audience' && failure.actualAudience && (
                <button
                  type="button"
                  onClick={() => switchAudience(failure.actualAudience as SignInAudience)}
                  className="mt-2 cursor-pointer font-semibold underline underline-offset-4"
                >
                  Switch to {failure.actualAudience === 'professional' ? 'professional' : 'customer'} sign-in
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleEmailSignIn} noValidate className="mt-6">
            {!isPro && (
              <>
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  disabled={isLoading}
                  className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-line-strong bg-paper text-[15px] font-medium transition-colors hover:border-ink-3 disabled:opacity-60"
                >
                  <GoogleIcon />
                  Continue with Google
                </button>
                {googleError && <p role="alert" className="mt-2 text-[13px] text-clay">{googleError}</p>}
                <div className="my-5 flex items-center gap-3 text-[12px] uppercase tracking-[0.14em] text-ink-4">
                  <span className="h-px flex-1 bg-line-strong" /> or <span className="h-px flex-1 bg-line-strong" />
                </div>
              </>
            )}

            <div>
              <label htmlFor="email" className="text-[13.5px] font-semibold">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                disabled={isLoading}
                aria-invalid={Boolean(emailError)}
                className={`${inputCls} ${emailError ? 'border-clay' : 'border-line-strong'}`}
              />
              {emailError && <p role="alert" className="mt-1.5 text-[13px] text-clay">{emailError}</p>}
            </div>

            <div className="mt-4">
              <PasswordField
                id="password"
                label="Password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPasswordError(null); }}
                error={passwordError ?? undefined}
                disabled={isLoading}
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </div>

            <div className="mt-3 flex justify-end">
              <Link href="/auth/forgot-password" className="text-[13.5px] font-medium text-teal underline decoration-teal/30 underline-offset-4 hover:decoration-teal">
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className={`mt-5 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-porcelain transition-colors disabled:opacity-70 ${
                isPro ? 'bg-ink hover:bg-ink-2' : 'bg-teal hover:bg-teal-deep'
              }`}
            >
              {isLoading ? 'Signing you in…' : isPro ? 'Sign in to your workspace' : 'Sign in'}
              {!isLoading && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </form>

          <p className="mt-7 text-center text-[14px] text-ink-3">
            {copy.registerText}{' '}
            <Link href={copy.registerHref} className="font-semibold text-teal underline decoration-teal/30 underline-offset-4 hover:decoration-teal">
              {copy.registerCta}
            </Link>
          </p>
          <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-4">
            By continuing you agree to Feazy’s <Link href="/terms" className="underline underline-offset-2">terms</Link> and{' '}
            <Link href="/privacy" className="underline underline-offset-2">privacy notice</Link>.
            {isPro && ' Professionals must be verified before accepting jobs.'}
          </p>
    </AuthShell>
  );
}
