'use client';

import Image from 'next/image';
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Loader2, Lock } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Symbol } from '@/components/brand/Symbol';
import { PasswordField } from '@/components/ui/PasswordField';

/**
 * Password Reset/Recovery Form
 * 
 * Handles the recovery flow after user clicks reset link from email.
 * 
 * Flow:
 * 1. User clicks recovery link in email: /auth/callback?type=recovery&token=xxx
 * 2. Callback exchanges token for session
 * 3. Redirects to /auth/reset-password (user now has recovery session)
 * 4. User enters new password
 * 5. Form submits new password via supabase.auth.updateUser()
 * 6. Redirect to login (session terminated) or success page
 */

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [sessionValid, setSessionValid] = useState<boolean | null>(null);

  // Check if user has valid recovery session
  useEffect(() => {
    const checkSession = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          setSessionValid(true);
        } else {
          setSessionValid(false);
          setError('Your recovery link has expired. Please request a new password reset.');
        }
      } catch (err) {
        setSessionValid(false);
        setError('Could not verify your session. Please try again.');
      }
    };

    checkSession();
  }, []);

  /**
   * Validate password strength
   */
  const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain an uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain a lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain a number');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  };

  /**
   * Handle password reset submission
   */
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    // Validate inputs
    if (!newPassword.trim()) {
      setError('Enter a new password');
      return;
    }

    if (!confirmPassword.trim()) {
      setError('Confirm your new password');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please try again.');
      return;
    }

    // Validate password strength
    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      setError(validation.errors.join('; '));
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();

      // Update user's password
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);

      // Redirect to login after brief delay to show success state
      setTimeout(() => {
        router.push('/auth/login?reset=success');
      }, 2000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reset password';
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  // Loading state while checking session
  if (sessionValid === null) {
    return (
      <main id="main-content" className="page">
        <section className="visual" aria-label="Feazy home maintenance introduction">
          <Image 
            src="https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1800&q=88" 
            alt="Calm bedroom interior"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 50vw"
            className="object-cover"
            style={{ filter: 'saturate(0.88) contrast(1.06) brightness(0.78)' }}
          />
          <div className="visual-grid" aria-hidden="true" />
        </section>

        <section className="form-side">
          <div className="form-wrap">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
              <Loader2 size={32} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          </div>
        </section>

        <style jsx>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          .page { min-height: 100dvh; width: 100%; display: grid; grid-template-columns: minmax(0,.92fr) minmax(420px,1.08fr); }
          .visual { position: relative; min-height: 100vh; padding: 28px; overflow: hidden; background: var(--color-ink); }
          .visual img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(.88) contrast(1.06) brightness(.78); }
          .visual::before { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg,rgba(8,23,20,.22),rgba(8,23,20,.82)),linear-gradient(90deg,rgba(8,23,20,.30),rgba(8,23,20,.08) 70%); z-index: 1; }
          .visual-grid { position: absolute; inset: 0; z-index: 2; background-image: linear-gradient(rgba(255,255,255,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.055) 1px,transparent 1px); background-size: 34px 34px; opacity: .45; mask-image: linear-gradient(to bottom,black,transparent 90%); }
          .form-side { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 54px 7vw; background: var(--color-paper); }
          .form-wrap { width: min(100%,460px); }
          @media (max-width:900px) { .page { grid-template-columns: 1fr; } .visual { display: none; } .form-side { min-height: 100vh; padding: 36px 24px; } }
          .spinner { color: var(--color-teal); }
        `}</style>
      </main>
    );
  }

  // Session invalid state
  if (!sessionValid) {
    return (
      <main id="main-content" className="page">
        <section className="visual" aria-label="Feazy home maintenance introduction">
          <Image 
            src="https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1800&q=88" 
            alt="Calm bedroom interior"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 50vw"
            className="object-cover"
            style={{ filter: 'saturate(0.88) contrast(1.06) brightness(0.78)' }}
          />
          <div className="visual-grid" aria-hidden="true" />
          <div className="visual-top"><Link className="back" href="/">Back to home</Link></div>
        </section>

        <section className="form-side">
          <div className="form-wrap">
            <Link className="brand auth-brand" href="/"><Symbol size="lg" className="brand-mark" /><span>FEAZY</span></Link>
            <div className="error-state">
              <div className="error-icon" aria-hidden="true">⚠</div>
              <p className="form-eyebrow">SESSION EXPIRED</p>
              <h2>Reset link expired.</h2>
              <p className="sub">{error || 'Your recovery link has expired or is invalid.'}</p>
              <Link className="back-link" href="/auth/forgot-password">Request a new reset link</Link>
            </div>
          </div>
        </section>

        <style jsx>{`
          .page { min-height: 100dvh; width: 100%; display: grid; grid-template-columns: minmax(0,.92fr) minmax(420px,1.08fr); }
          .visual { position: relative; min-height: 100vh; padding: 28px; overflow: hidden; background: var(--color-ink); }
          .visual img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(.88) contrast(1.06) brightness(.78); }
          .visual::before { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg,rgba(8,23,20,.22),rgba(8,23,20,.82)),linear-gradient(90deg,rgba(8,23,20,.30),rgba(8,23,20,.08) 70%); z-index: 1; }
          .visual-grid { position: absolute; inset: 0; z-index: 2; background-image: linear-gradient(rgba(255,255,255,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.055) 1px,transparent 1px); background-size: 34px 34px; opacity: .45; mask-image: linear-gradient(to bottom,black,transparent 90%); }
          .visual-top { position: relative; z-index: 3; display: flex; justify-content: flex-end; color: white; }
          .back { font-size: 12px; color: rgba(255,255,255,.72); padding-top: 5px; text-decoration: none; }
          .form-side { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 54px 7vw; background: var(--color-paper); }
          .form-wrap { width: min(100%,460px); }
          .auth-brand { align-items: center; color: var(--color-ink); display: flex; gap: 14px; justify-content: center; margin: 0 auto 48px; width: max-content; font-family: "Space Grotesk", var(--font-sans), sans-serif; font-size: 30px; font-weight: 800; letter-spacing: .14em; line-height: 1; text-transform: uppercase; }
          .auth-brand .brand-mark { width: 50px; height: 50px; color: var(--color-teal); }
          .error-state { text-align: center; }
          .error-icon { font-size: 48px; margin-bottom: 24px; }
          .form-eyebrow { color: var(--color-ink-4); font: 600 10px var(--font-mono); letter-spacing: .12em; text-transform: uppercase; }
          .form-wrap h2 { color: var(--color-ink); font-size: clamp(36px,4.2vw,48px); line-height: 1.02; letter-spacing: -.05em; margin: 12px 0 0; }
          .sub { color: var(--color-ink-3); margin: 11px 0 0; font-size: 15px; line-height: 1.6; }
          .back-link { align-items: center; color: var(--color-teal); display: inline-flex; gap: 7px; font-size: 13px; font-weight: 700; text-decoration: none; margin-top: 30px; }
          @media (max-width:900px) { .page { grid-template-columns: 1fr; } .visual { display: none; } .form-side { min-height: 100vh; padding: 36px 24px; } .auth-brand { display: flex; font-size: 24px; gap: 10px; margin: 0 0 42px; } .auth-brand .brand-mark { width: 38px; height: 38px; } }
        `}</style>
      </main>
    );
  }

  // Success state
  if (success) {
    return (
      <main id="main-content" className="page">
        <section className="visual" aria-label="Feazy home maintenance introduction">
          <Image 
            src="https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1800&q=88" 
            alt="Calm bedroom interior"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 50vw"
            className="object-cover"
            style={{ filter: 'saturate(0.88) contrast(1.06) brightness(0.78)' }}
          />
          <div className="visual-grid" aria-hidden="true" />
          <div className="visual-top"><Link className="back" href="/">Back to home</Link></div>
        </section>

        <section className="form-side">
          <div className="form-wrap">
            <Link className="brand auth-brand" href="/"><Symbol size="lg" className="brand-mark" /><span>FEAZY</span></Link>
            <div className="success-state">
              <div className="success-icon" aria-hidden="true"><CheckCircle2 /></div>
              <p className="form-eyebrow">PASSWORD RESET</p>
              <h2>You're all set.</h2>
              <p className="sub">Your password has been reset successfully. Redirecting to sign in…</p>
            </div>
          </div>
        </section>

        <style jsx>{`
          .page { min-height: 100dvh; width: 100%; display: grid; grid-template-columns: minmax(0,.92fr) minmax(420px,1.08fr); }
          .visual { position: relative; min-height: 100vh; padding: 28px; overflow: hidden; background: var(--color-ink); }
          .visual img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(.88) contrast(1.06) brightness(.78); }
          .visual::before { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg,rgba(8,23,20,.22),rgba(8,23,20,.82)),linear-gradient(90deg,rgba(8,23,20,.30),rgba(8,23,20,.08) 70%); z-index: 1; }
          .visual-grid { position: absolute; inset: 0; z-index: 2; background-image: linear-gradient(rgba(255,255,255,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.055) 1px,transparent 1px); background-size: 34px 34px; opacity: .45; mask-image: linear-gradient(to bottom,black,transparent 90%); }
          .visual-top { position: relative; z-index: 3; display: flex; justify-content: flex-end; color: white; }
          .back { font-size: 12px; color: rgba(255,255,255,.72); padding-top: 5px; text-decoration: none; }
          .form-side { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 54px 7vw; background: var(--color-paper); }
          .form-wrap { width: min(100%,460px); }
          .auth-brand { align-items: center; color: var(--color-ink); display: flex; gap: 14px; justify-content: center; margin: 0 auto 48px; width: max-content; font-family: "Space Grotesk", var(--font-sans), sans-serif; font-size: 30px; font-weight: 800; letter-spacing: .14em; line-height: 1; text-transform: uppercase; }
          .auth-brand .brand-mark { width: 50px; height: 50px; color: var(--color-teal); }
          .success-state { text-align: center; }
          .success-icon { align-items: center; background: var(--color-teal-soft); border: 1px solid rgba(23,107,91,.18); border-radius: 16px; color: var(--color-teal); display: flex; height: 58px; justify-content: center; margin-bottom: 30px; width: 58px; margin-left: auto; margin-right: auto; }
          .success-icon :global(svg) { height: 29px; width: 29px; }
          .form-eyebrow { color: var(--color-ink-4); font: 600 10px var(--font-mono); letter-spacing: .12em; text-transform: uppercase; }
          .form-wrap h2 { color: var(--color-ink); font-size: clamp(36px,4.2vw,48px); line-height: 1.02; letter-spacing: -.05em; margin: 12px 0 0; }
          .sub { color: var(--color-ink-3); margin: 11px 0 0; font-size: 15px; line-height: 1.6; }
          @media (max-width:900px) { .page { grid-template-columns: 1fr; } .visual { display: none; } .form-side { min-height: 100vh; padding: 36px 24px; } .auth-brand { display: flex; font-size: 24px; gap: 10px; margin: 0 0 42px; } .auth-brand .brand-mark { width: 38px; height: 38px; } }
        `}</style>
      </main>
    );
  }

  // Main form state
  return (
    <main id="main-content" className="page">
      <section className="visual" aria-label="Feazy home maintenance introduction">
        <Image 
            src="https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1800&q=88" 
            alt="Calm bedroom interior"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 50vw"
            className="object-cover"
            style={{ filter: 'saturate(0.88) contrast(1.06) brightness(0.78)' }}
          />
        <div className="visual-grid" aria-hidden="true" />
        <div className="visual-top"><Link className="back" href="/">Back to home</Link></div>
        <div className="visual-bottom">
          <p className="visual-eyebrow">SECURE YOUR ACCOUNT</p>
          <h1>Create a strong new password to protect your home.</h1>
          <p>Make it unique and remember it this time.</p>
        </div>
      </section>

      <section className="form-side">
        <div className="form-wrap">
          <Link className="brand auth-brand" href="/"><Symbol size="lg" className="brand-mark" /><span>FEAZY</span></Link>
          <p className="form-eyebrow">ACCOUNT SECURITY</p>
          <h2>Reset your password.</h2>
          <p className="sub">Enter a new password for your Feazy account. Make it strong and unique.</p>

          <form className="form" onSubmit={handleSubmit} noValidate>
            {error && <div className="status-msg error-msg" role="alert">{error}</div>}

            <div className="field">
              <PasswordField
                id="new-password"
                label="New password"
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setError(null);
                }}
                disabled={isLoading}
                required
                autoComplete="new-password"
                placeholder="Enter a new password"
              />
              <div className="password-hint">
                <p>Password must contain:</p>
                <ul>
                  <li className={newPassword.length >= 8 ? 'valid' : ''}>At least 8 characters</li>
                  <li className={/[A-Z]/.test(newPassword) ? 'valid' : ''}>One uppercase letter</li>
                  <li className={/[a-z]/.test(newPassword) ? 'valid' : ''}>One lowercase letter</li>
                  <li className={/[0-9]/.test(newPassword) ? 'valid' : ''}>One number</li>
                </ul>
              </div>
            </div>

            <div className="field">
              <PasswordField
                id="confirm-password"
                label="Confirm password"
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError(null);
                }}
                disabled={isLoading}
                required
                autoComplete="new-password"
                placeholder="Confirm your password"
              />
            </div>

            <button type="submit" className="submit" disabled={isLoading}>
              {isLoading ? <><Loader2 className="spinner" size={17} /> Resetting password…</> : 'Reset password ↗'}
            </button>
          </form>

          <p className="fineprint">Remember your original password? <Link href="/auth/login">Sign in instead</Link></p>
        </div>
      </section>

      <style jsx>{`
        .page { min-height: 100dvh; width: 100%; display: grid; grid-template-columns: minmax(0,.92fr) minmax(420px,1.08fr); }
        .visual { position: relative; min-height: 100vh; padding: 28px; overflow: hidden; background: var(--color-ink); }
        .visual img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(.88) contrast(1.06) brightness(.78); }
        .visual::before { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg,rgba(8,23,20,.22),rgba(8,23,20,.82)),linear-gradient(90deg,rgba(8,23,20,.30),rgba(8,23,20,.08) 70%); z-index: 1; }
        .visual-grid { position: absolute; inset: 0; z-index: 2; background-image: linear-gradient(rgba(255,255,255,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.055) 1px,transparent 1px); background-size: 34px 34px; opacity: .45; mask-image: linear-gradient(to bottom,black,transparent 90%); }
        .visual-top { position: relative; z-index: 3; display: flex; justify-content: flex-end; color: white; }
        .back { font-size: 12px; color: rgba(255,255,255,.72); padding-top: 5px; text-decoration: none; }
        .visual-bottom { position: absolute; left: 28px; right: 28px; bottom: 30px; z-index: 3; padding: 24px; background: linear-gradient(180deg,rgba(8,23,20,.76),rgba(8,23,20,.96)); border: 1px solid rgba(255,255,255,.12); border-radius: 12px; backdrop-filter: blur(8px); }
        .visual-eyebrow { margin: 0 0 13px; color: #8dd1c0; font: 600 10px var(--font-mono); letter-spacing: .12em; text-transform: uppercase; }
        .visual-bottom h1 { margin: 0; font-size: clamp(42px,5vw,68px); line-height: 1.02; letter-spacing: -.055em; max-width: 12ch; color: white; }
        .visual-bottom > p:not(.visual-eyebrow) { margin: 13px 0 0; max-width: 43ch; color: rgba(255,255,255,.64); font-size: 14px; line-height: 1.55; }
        .form-side { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 54px 7vw; background: var(--color-paper); }
        .form-wrap { width: min(100%,460px); }
        .auth-brand { align-items: center; color: var(--color-ink); display: flex; gap: 14px; justify-content: center; margin: 0 auto 48px; width: max-content; font-family: "Space Grotesk", var(--font-sans), sans-serif; font-size: 30px; font-weight: 800; letter-spacing: .14em; line-height: 1; text-transform: uppercase; }
        .auth-brand .brand-mark { width: 50px; height: 50px; color: var(--color-teal); }
        .form-eyebrow { color: var(--color-ink-4); font: 600 10px var(--font-mono); letter-spacing: .12em; text-transform: uppercase; }
        .form-wrap h2 { color: var(--color-ink); font-size: clamp(36px,4.2vw,48px); line-height: 1.02; letter-spacing: -.05em; margin: 12px 0 0; }
        .sub { color: var(--color-ink-3); margin: 11px 0 0; font-size: 15px; line-height: 1.6; }
        .form { margin-top: 30px; }
        .field { display: grid; gap: 7px; margin-top: 17px; }
        .field label { color: var(--color-ink); font-size: 13px; font-weight: 650; }
        .input-wrap { position: relative; }
        .field-icon { position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--color-ink-4); pointer-events: none; }
        .input { width: 100%; height: 54px; border: 1px solid var(--color-line-strong); border-radius: 11px; background: var(--color-paper); padding: 0 14px 0 45px; color: var(--color-ink); outline: 0; transition: border-color .2s,box-shadow .2s; font-family: inherit; font-size: 15px; }
        .input:focus { border-color: var(--color-teal); box-shadow: 0 0 0 4px rgba(23, 107, 91, 0.10); }
        .input:disabled { opacity: .6; }
        .show-pass { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); width: auto; height: auto; border: 0; background: transparent; display: flex; align-items: center; justify-content: center; color: var(--color-ink-4); cursor: pointer; padding: 0; transition: color .2s ease; }
        .show-pass:hover { color: var(--color-ink); }
        .show-pass svg { width: 18px; height: 18px; }
        .password-hint { margin-top: 12px; padding: 12px; background: #f0f4f2; border-radius: 8px; }
        .password-hint p { font-size: 12px; font-weight: 600; color: var(--color-ink-3); margin: 0 0 8px; }
        .password-hint ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 4px; }
        .password-hint li { font-size: 12px; color: #666; display: flex; align-items: center; gap: 6px; }
        .password-hint li.valid { color: #22863a; }
        .password-hint li.valid::before { content: '✓'; color: #22863a; font-weight: bold; }
        .password-hint li:not(.valid)::before { content: '○'; color: #ccc; }
        .submit { width: 100%; height: 54px; margin-top: 22px; border: 0; border-radius: 11px; background: var(--color-teal); color: #fff; font-weight: 700; cursor: pointer; box-shadow: 0 11px 24px rgba(23, 107, 91, 0.16); transition: .24s cubic-bezier(.22,1,.36,1); font-family: inherit; font-size: 15px; }
        .submit:hover:not(:disabled) { background: var(--color-teal-deep); transform: translateY(-2px); box-shadow: 0 15px 30px rgba(23, 107, 91, 0.22); }
        .submit:disabled { opacity: .6; cursor: not-allowed; }
        .spinner { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .status-msg { min-height: 18px; margin-top: 11px; font-size: 12px; }
        .error-msg { color: var(--color-danger); margin: 0 0 12px; }
        .fineprint { color: var(--color-ink-4); font-size: 11px; line-height: 1.55; margin-top: 28px; }
        .fineprint a { color: var(--color-teal); text-decoration: underline; text-underline-offset: 2px; }
        @media (max-width:900px) { 
          .page { grid-template-columns: 1fr; } 
          .visual { display: none; } 
          .form-side { min-height: 100vh; padding: 36px 24px; } 
          .auth-brand { display: flex; font-size: 24px; gap: 10px; margin: 0 0 42px; } 
          .auth-brand .brand-mark { width: 38px; height: 38px; } 
          .form-wrap h2 { font-size: 38px; } 
          .form { margin-top: 24px; } 
        }
        @media (max-width:520px) { 
          .form-side { padding: 28px 18px; } 
          .auth-brand { margin-bottom: 30px; } 
          .form-wrap h2 { font-size: 38px; } 
        }
        @media (prefers-reduced-motion:reduce) { 
          .submit, .input { transition: none; } 
          .spinner { animation: none; } 
        }
      `}</style>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <main id="main-content" className="page">
        <section className="visual" aria-label="Feazy home maintenance introduction">
          <Image 
            src="https://images.unsplash.com/photo-1505691938895-1758d7feb511?auto=format&fit=crop&w=1800&q=88" 
            alt="Calm bedroom interior"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 50vw"
            className="object-cover"
            style={{ filter: 'saturate(0.88) contrast(1.06) brightness(0.78)' }}
          />
          <div className="visual-grid" aria-hidden="true" />
        </section>

        <section className="form-side">
          <div className="form-wrap">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
              <Loader2 size={32} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          </div>
        </section>

        <style jsx>{`
          @keyframes spin { to { transform: rotate(360deg); } }
          .page { min-height: 100dvh; width: 100%; display: grid; grid-template-columns: minmax(0,.92fr) minmax(420px,1.08fr); }
          .visual { position: relative; min-height: 100vh; padding: 28px; overflow: hidden; background: var(--color-ink); }
          .visual img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; filter: saturate(.88) contrast(1.06) brightness(.78); }
          .visual::before { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg,rgba(8,23,20,.22),rgba(8,23,20,.82)),linear-gradient(90deg,rgba(8,23,20,.30),rgba(8,23,20,.08) 70%); z-index: 1; }
          .visual-grid { position: absolute; inset: 0; z-index: 2; background-image: linear-gradient(rgba(255,255,255,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.055) 1px,transparent 1px); background-size: 34px 34px; opacity: .45; mask-image: linear-gradient(to bottom,black,transparent 90%); }
          .form-side { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 54px 7vw; background: var(--color-paper); }
          .form-wrap { width: min(100%,460px); }
          .spinner { color: var(--color-teal); }
        `}</style>
      </main>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}
