'use client';

import Link from 'next/link';
import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, MailCheck } from 'lucide-react';
import { registerProfessional } from './actions';
import { signInWithGoogle } from '@/app/auth/actions';
import { GoogleIcon, authInput } from '@/components/auth/auth-shell';
import { PasswordField } from '@/components/ui/PasswordField';

type Key = 'fullName' | 'displayName' | 'yearsExperience' | 'email' | 'password' | 'confirmPassword';

const linkCls = 'font-semibold text-teal underline decoration-teal/30 underline-offset-4 hover:decoration-teal';

const TEXT_FIELDS = [
  ['fullName', 'Full name', 'text', 'name', 'As on your ID'],
  ['displayName', 'Display name', 'text', 'nickname', 'How customers will see you'],
  ['yearsExperience', 'Years of experience', 'number', 'off', '0'],
  ['email', 'Email address', 'email', 'email', 'you@example.com'],
] as const;

export function ProfessionalRegisterForm() {
  const router = useRouter();
  const [form, setForm] = useState<Record<Key, string>>({
    fullName: '', displayName: '', yearsExperience: '', email: '', password: '', confirmPassword: '',
  });
  const [errors, setErrors] = useState<Partial<Record<Key, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loadingMode, setLoadingMode] = useState<'email' | 'google' | null>(null);
  const [success, setSuccess] = useState(false);

  const update = (key: Key) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
    setError(null);
  };

  const validate = () => {
    const next: Partial<Record<Key, string>> = {};
    const years = parseInt(form.yearsExperience, 10);
    if (form.fullName.trim().length < 2) next.fullName = 'Enter your full name.';
    if (form.displayName.trim().length < 2) next.displayName = 'Enter the name customers will see.';
    if (Number.isNaN(years) || years < 0 || years > 70) next.yearsExperience = 'Enter years of experience (0-70).';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) next.email = 'Enter a valid email address.';
    if (form.password.length < 8 || !/[A-Z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      next.password = 'Use 8+ characters with at least one number and one capital letter.';
    }
    if (form.password !== form.confirmPassword) next.confirmPassword = 'Passwords do not match.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!validate()) return;
    setLoadingMode('email');
    try {
      const result = await registerProfessional({
        email: form.email,
        password: form.password,
        full_name: form.fullName,
        display_name: form.displayName,
        years_experience: parseInt(form.yearsExperience, 10),
      });
      if (!result.success) {
        setError(result.error || 'We could not create your account. Check your details and try again.');
        return;
      }
      setSuccess(true);
      window.setTimeout(() => router.push('/auth/verify-email'), 900);
    } catch {
      setError('We could not create your account right now. Your details are still here, please try again.');
    } finally {
      setLoadingMode(null);
    }
  };

  const continueWithGoogle = async () => {
    setError(null);
    setLoadingMode('google');
    try {
      const result = await signInWithGoogle();
      if (result?.url) window.location.assign(result.url);
      else setError('Google registration could not be started. Please use email instead.');
    } catch {
      setError('Google registration could not be started. Please try again.');
    } finally {
      setLoadingMode(null);
    }
  };

  const busy = Boolean(loadingMode);

  if (success) {
    return (
      <div role="status" aria-live="polite">
        <span className="grid size-12 place-items-center rounded-xl bg-ink text-[#7FC4B1]">
          <MailCheck size={22} aria-hidden="true" />
        </span>
        <h1 className="mt-6 font-editorial text-[clamp(34px,5vw,44px)] font-normal leading-[1.05] tracking-[-0.02em]">Check your email.</h1>
        <p className="mt-3 text-[15px] text-ink-3">
          Your professional account is created. Confirm your email, then we verify your credentials before you can accept jobs.
        </p>
        <p className="mt-6 text-[13px] text-ink-4">Opening confirmation…</p>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-editorial text-[clamp(34px,5vw,44px)] font-normal leading-[1.05] tracking-[-0.02em]">Apply to work on Feazy.</h1>
      <p className="mt-2 text-[15px] text-ink-3">Create your professional account. We verify credentials before you can accept jobs.</p>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-clay/30 bg-clay/10 px-4 py-3 text-[14px] text-clay">{error}</p>
      )}

      <form onSubmit={submit} noValidate className="mt-6">
        <button
          type="button"
          onClick={continueWithGoogle}
          disabled={busy}
          className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-line-strong bg-paper text-[15px] font-medium transition-colors hover:border-ink-3 disabled:opacity-60"
        >
          <GoogleIcon /> {loadingMode === 'google' ? 'Connecting…' : 'Continue with Google'}
        </button>
        <div className="my-5 flex items-center gap-3 text-[12px] uppercase tracking-[0.14em] text-ink-4">
          <span className="h-px flex-1 bg-line-strong" /> or <span className="h-px flex-1 bg-line-strong" />
        </div>

        {TEXT_FIELDS.map(([key, label, type, auto, placeholder], i) => (
          <div key={key} className={i ? 'mt-4' : ''}>
            <label htmlFor={key} className="text-[13.5px] font-semibold">{label}</label>
            <input
              id={key}
              name={key}
              type={type}
              min={type === 'number' ? 0 : undefined}
              max={type === 'number' ? 70 : undefined}
              inputMode={type === 'number' ? 'numeric' : type === 'email' ? 'email' : undefined}
              autoComplete={auto}
              placeholder={placeholder}
              value={form[key]}
              onChange={update(key)}
              disabled={busy}
              aria-invalid={Boolean(errors[key])}
              className={`${authInput} ${errors[key] ? 'border-clay' : 'border-line-strong'}`}
            />
            {errors[key] && <p role="alert" className="mt-1.5 text-[13px] text-clay">{errors[key]}</p>}
          </div>
        ))}

        <div className="mt-4">
          <PasswordField id="password" label="Password" value={form.password} onChange={update('password')} error={errors.password} autoComplete="new-password" disabled={busy} placeholder="8+ characters, a capital and a number" />
        </div>
        <div className="mt-4">
          <PasswordField id="confirmPassword" label="Confirm password" value={form.confirmPassword} onChange={update('confirmPassword')} error={errors.confirmPassword} autoComplete="new-password" disabled={busy} placeholder="Repeat your password" />
        </div>

        <button
          type="submit"
          disabled={busy}
          className="mt-6 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-ink text-[15px] font-semibold text-porcelain transition-colors hover:bg-ink-2 disabled:opacity-70"
        >
          {loadingMode === 'email' ? 'Creating your account…' : 'Create professional account'}
          {loadingMode !== 'email' && <ArrowRight size={16} aria-hidden="true" />}
        </button>
      </form>

      <p className="mt-7 text-center text-[14px] text-ink-3">
        Already registered? <Link href="/auth/login?as=professional" className={linkCls}>Sign in</Link>
      </p>
      <p className="mt-2 text-center text-[14px] text-ink-3">
        Need a repair instead? <Link href="/auth/register" className={linkCls}>Register as a customer</Link>
      </p>
      <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-4">
        By continuing you agree to Feazy’s <Link href="/terms" className="underline underline-offset-2">terms</Link> and{' '}
        <Link href="/privacy" className="underline underline-offset-2">privacy notice</Link>.
      </p>
    </>
  );
}
