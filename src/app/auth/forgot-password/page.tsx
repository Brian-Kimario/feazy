'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, MailCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { AuthShell, authInput } from '@/components/auth/auth-shell';
import { forgotPasswordSchema } from '@/validators';
import {
  RESEND_COOLDOWN_SECONDS,
  RESET_FAILURE_COPY,
  classifyResetError,
  cooldownRemaining,
  maskEmail,
} from '@/lib/auth-flow/password-reset';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const successRef = useRef<HTMLHeadingElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cooldownUntil) return;
    const tick = () => setSecondsLeft(cooldownRemaining(cooldownUntil, Date.now()));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  // Move focus to the confirmation so screen readers announce it.
  useEffect(() => {
    if (sentTo) successRef.current?.focus();
  }, [sentTo]);

  async function send(address: string) {
    setIsLoading(true);
    setFailure(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(address, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      });
      if (error) {
        setFailure(RESET_FAILURE_COPY[classifyResetError(error)]);
        return;
      }
      setSentTo(address);
      setCooldownUntil(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setFailure(RESET_FAILURE_COPY[classifyResetError({ message })]);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = forgotPasswordSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Enter a valid email address.');
      inputRef.current?.focus();
      return;
    }
    setFieldError(null);
    void send(parsed.data.email);
  }

  function useDifferentEmail() {
    setSentTo(null);
    setFailure(null);
    setCooldownUntil(0);
    setSecondsLeft(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  const canResend = !isLoading && secondsLeft === 0;

  return (
    <AuthShell audience="customer" backHref="/auth/login" backLabel="Back to sign in">
      {sentTo ? (
        <div className="mt-8">
          <span className="grid size-14 place-items-center rounded-2xl bg-teal-wash text-teal">
            <MailCheck size={26} aria-hidden="true" />
          </span>
          <h1
            ref={successRef}
            tabIndex={-1}
            className="mt-6 font-editorial text-[clamp(34px,5vw,44px)] font-normal leading-[1.05] tracking-[-0.02em] outline-none"
          >
            Check your inbox.
          </h1>
          <p role="status" className="mt-3 text-[15px] leading-relaxed text-ink-3">
            If an account exists for <span className="font-semibold text-ink">{maskEmail(sentTo)}</span>, we have sent a
            link to choose a new password. It works once and expires soon.
          </p>

          <ul className="mt-6 space-y-2 rounded-xl bg-porcelain p-4 text-[13.5px] text-ink-2 ring-1 ring-line-strong">
            <li>Nothing yet? Check spam or promotions.</li>
            <li>Open the link in this browser so we can finish the reset.</li>
          </ul>

          {failure && (
            <p role="alert" className="mt-5 rounded-xl border border-clay/30 bg-clay/10 px-4 py-3 text-[14px] text-clay">
              {failure}
            </p>
          )}

          <button
            type="button"
            onClick={() => void send(sentTo)}
            disabled={!canResend}
            className="mt-6 inline-flex min-h-12 w-full cursor-pointer items-center justify-center rounded-xl border border-line-strong bg-paper text-[15px] font-semibold transition-colors hover:border-ink-3 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? 'Sending…' : secondsLeft > 0 ? `Resend email in ${secondsLeft}s` : 'Resend email'}
          </button>
          <button
            type="button"
            onClick={useDifferentEmail}
            className="mt-4 w-full cursor-pointer text-center text-[14px] font-medium text-teal underline decoration-teal/30 underline-offset-4 hover:decoration-teal"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <>
          <p className="mt-8 text-[12px] font-semibold uppercase tracking-[0.16em] text-teal">Account access</p>
          <h1 className="mt-3 font-editorial text-[clamp(34px,5vw,44px)] font-normal leading-[1.05] tracking-[-0.02em]">
            Reset your password.
          </h1>
          <p className="mt-2 text-[15px] text-ink-3">
            Enter your email and we will send you a secure link to get back into your Feasy account.
          </p>

          {failure && (
            <p role="alert" className="mt-6 rounded-xl border border-clay/30 bg-clay/10 px-4 py-3 text-[14px] text-clay">
              {failure}
            </p>
          )}

          <form onSubmit={handleSubmit} noValidate className="mt-6">
            <label htmlFor="email" className="text-[13.5px] font-semibold">
              Email address
            </label>
            <input
              ref={inputRef}
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFieldError(null);
              }}
              disabled={isLoading}
              aria-invalid={Boolean(fieldError)}
              aria-describedby={fieldError ? 'email-error' : undefined}
              className={`${authInput} ${fieldError ? 'border-clay' : 'border-line-strong'}`}
            />
            {fieldError && (
              <p id="email-error" role="alert" className="mt-1.5 text-[13px] text-clay">
                {fieldError}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-5 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-teal text-[15px] font-semibold text-porcelain transition-colors hover:bg-teal-deep disabled:opacity-70"
            >
              {isLoading ? 'Sending link…' : 'Send reset link'}
              {!isLoading && <ArrowRight size={16} aria-hidden="true" />}
            </button>
          </form>

          <p className="mt-8 text-center text-[12px] leading-relaxed text-ink-4">
            For your security, Feasy never asks you to share your password by email or message.
          </p>
        </>
      )}
    </AuthShell>
  );
}
