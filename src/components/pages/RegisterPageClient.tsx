'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { registerWithEmail } from '@/app/auth/register/actions';
import { signInWithGoogle } from '@/app/auth/actions';
import { AuthShell, GoogleIcon, authInput } from '@/components/auth/auth-shell';
import { PasswordField } from '@/components/ui/PasswordField';

type Field = 'fullName' | 'email' | 'password' | 'confirmPassword';

const linkCls = 'font-semibold text-teal underline decoration-teal/30 underline-offset-4 hover:decoration-teal';

export function RegisterPageClient() {
  const router = useRouter();
  const [values, setValues] = useState<Record<Field, string>>({ fullName: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const set = (key: Field) => (value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setError(null);
  };

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const next: Partial<Record<Field, string>> = {};
    if (!values.fullName.trim()) next.fullName = 'Enter your name.';
    if (!/^\S+@\S+\.\S+$/.test(values.email.trim())) next.email = 'Enter a valid email address.';
    if (values.password.length < 8) next.password = 'Use at least 8 characters.';
    if (values.password !== values.confirmPassword) next.confirmPassword = 'Passwords do not match.';
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setIsLoading(true);
    try {
      const res = await registerWithEmail({ email: values.email, password: values.password, full_name: values.fullName, role: 'customer' });
      if (!res.success) {
        const msg = res.error || '';
        setError(msg.includes('already registered') ? 'This email is already registered. Sign in instead.' : msg || 'Could not create your account. Please try again.');
        setIsLoading(false);
        return;
      }
      router.push('/auth/login?as=customer&registered=true');
    } catch {
      setError('Could not create your account. Please try again.');
      setIsLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result?.url) {
        window.location.assign(result.url);
        return;
      }
      setError('Google sign-up could not be started. Please use email instead.');
    } catch {
      setError('Google sign-up could not be started. Please try again.');
    }
    setIsLoading(false);
  };

  return (
    <AuthShell audience="customer">
      <h1 className="font-editorial text-[clamp(34px,5vw,44px)] font-normal leading-[1.05] tracking-[-0.02em]">Create your account.</h1>
      <p className="mt-2 text-[15px] text-ink-3">Book verified professionals and keep every repair on record.</p>

      {error && (
        <p role="alert" className="mt-6 rounded-xl border border-clay/30 bg-clay/10 px-4 py-3 text-[14px] text-clay">
          {error}{' '}
          {error.includes('already registered') && <Link href="/auth/login?as=customer" className="font-semibold underline">Sign in</Link>}
        </p>
      )}

      <form onSubmit={handleRegister} noValidate className="mt-6">
        <button
          type="button"
          onClick={handleGoogle}
          disabled={isLoading}
          className="flex min-h-12 w-full cursor-pointer items-center justify-center gap-3 rounded-xl border border-line-strong bg-paper text-[15px] font-medium transition-colors hover:border-ink-3 disabled:opacity-60"
        >
          <GoogleIcon /> Continue with Google
        </button>
        <div className="my-5 flex items-center gap-3 text-[12px] uppercase tracking-[0.14em] text-ink-4">
          <span className="h-px flex-1 bg-line-strong" /> or <span className="h-px flex-1 bg-line-strong" />
        </div>

        {([
          ['fullName', 'Full name', 'text', 'name', 'Your name'],
          ['email', 'Email address', 'email', 'email', 'you@example.com'],
        ] as const).map(([key, label, type, auto, placeholder], i) => (
          <div key={key} className={i ? 'mt-4' : ''}>
            <label htmlFor={key} className="text-[13.5px] font-semibold">{label}</label>
            <input
              id={key}
              type={type}
              autoComplete={auto}
              inputMode={type === 'email' ? 'email' : undefined}
              placeholder={placeholder}
              value={values[key]}
              onChange={(e) => set(key)(e.target.value)}
              disabled={isLoading}
              aria-invalid={Boolean(errors[key])}
              className={`${authInput} ${errors[key] ? 'border-clay' : 'border-line-strong'}`}
            />
            {errors[key] && <p role="alert" className="mt-1.5 text-[13px] text-clay">{errors[key]}</p>}
          </div>
        ))}

        <div className="mt-4">
          <PasswordField id="password" label="Password" value={values.password} onChange={(e) => set('password')(e.target.value)} error={errors.password} disabled={isLoading} autoComplete="new-password" placeholder="At least 8 characters" />
        </div>
        <div className="mt-4">
          <PasswordField id="confirmPassword" label="Confirm password" value={values.confirmPassword} onChange={(e) => set('confirmPassword')(e.target.value)} error={errors.confirmPassword} disabled={isLoading} autoComplete="new-password" placeholder="Repeat your password" />
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="mt-6 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-teal text-[15px] font-semibold text-porcelain transition-colors hover:bg-teal-deep disabled:opacity-70"
        >
          {isLoading ? 'Creating your account…' : 'Create account'}
          {!isLoading && <ArrowRight size={16} aria-hidden="true" />}
        </button>
      </form>

      <p className="mt-7 text-center text-[14px] text-ink-3">
        Already have an account? <Link href="/auth/login?as=customer" className={linkCls}>Sign in</Link>
      </p>
      <p className="mt-2 text-center text-[14px] text-ink-3">
        Fix things for a living? <Link href="/auth/register/professional" className={linkCls}>Apply as a professional</Link>
      </p>
      <p className="mt-6 text-center text-[12px] leading-relaxed text-ink-4">
        By continuing you agree to Feazy’s <Link href="/terms" className="underline underline-offset-2">terms</Link> and{' '}
        <Link href="/privacy" className="underline underline-offset-2">privacy notice</Link>.
      </p>
    </AuthShell>
  );
}
