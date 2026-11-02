'use client';

import { useState } from 'react';
import Link from 'next/link';
import VerificationUpload from '@/components/professional/VerificationUpload';

interface OnboardingClientProps {
  verificationStatus: string;
  displayName: string;
  yearsExperience: number;
  submittedAt: string | null;
  rejectionReason: string | null;
}

export function OnboardingClient({
  verificationStatus,
  displayName,
  yearsExperience,
  submittedAt,
  rejectionReason,
}: OnboardingClientProps) {
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return '⏳';
      case 'documents_submitted':
        return '📋';
      case 'under_review':
        return '👀';
      case 'verified':
        return '✓';
      case 'rejected':
        return '❌';
      case 'suspended':
        return '⛔';
      default:
        return '❓';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'verified':
        return 'bg-green-50 border-green-200';
      case 'rejected':
      case 'suspended':
        return 'bg-red-50 border-red-200';
      case 'documents_submitted':
      case 'under_review':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-amber-50 border-amber-200';
    }
  };

  const getStatusDescription = (status: string): { title: string; description: string } => {
    switch (status) {
      case 'pending':
        return {
          title: 'Verification Pending',
          description: 'Complete your professional profile and submit required documents to start accepting jobs.',
        };
      case 'documents_submitted':
        return {
          title: 'Documents Under Review',
          description: 'We\'re verifying your credentials. This usually takes 1-2 business days. We\'ll notify you when verification is complete.',
        };
      case 'under_review':
        return {
          title: 'Under Review',
          description: 'Our team is reviewing your credentials to ensure quality and safety standards.',
        };
      case 'verified':
        return {
          title: 'Verified Professional',
          description: 'Your account is verified and ready to accept jobs. You can now view available opportunities.',
        };
      case 'rejected':
        return {
          title: 'Verification Rejected',
          description: rejectionReason
            ? `Reason: ${rejectionReason}`
            : 'Unfortunately, we were unable to verify your account at this time. Please contact support for more information.',
        };
      case 'suspended':
        return {
          title: 'Account Suspended',
          description: 'Your account has been suspended. Please contact support.',
        };
      default:
        return {
          title: 'Unknown Status',
          description: 'Unable to determine verification status.',
        };
    }
  };

  const statusInfo = getStatusDescription(verificationStatus);

  if (submitSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[var(--color-porcelain)] to-[var(--color-paper)] flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          <div className="rounded-[28px] border border-[var(--color-teal)]/25 bg-[var(--color-paper)] p-7 shadow-[0_24px_70px_rgba(24,33,31,0.09)] sm:p-10">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--color-teal-soft)] text-2xl text-[var(--color-teal)]">
              ✓
            </div>
            <p className="mt-7 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--color-teal)]">
              Documents Submitted
            </p>
            <h2 className="mt-3 font-[var(--font-display)] text-4xl font-bold leading-none tracking-[-0.06em]">
              Thanks for submitting.
            </h2>
            <p className="mt-4 text-sm leading-6 text-[var(--color-ink-3)]">
              We're reviewing your credentials. You'll receive an email notification when verification is complete (usually 1-2 business days).
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (verificationStatus === 'verified') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[var(--color-porcelain)] to-[var(--color-paper)] flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          <div className="rounded-[28px] border border-green-200 bg-green-50 p-7 shadow-[0_24px_70px_rgba(24,33,31,0.09)] sm:p-10">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-green-100 text-2xl text-green-600">
              ✓
            </div>
            <p className="mt-7 font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-green-600">
              Account Verified
            </p>
            <h2 className="mt-3 font-[var(--font-display)] text-4xl font-bold leading-none tracking-[-0.06em]">
              You're all set.
            </h2>
            <p className="mt-4 text-sm leading-6 text-[var(--color-ink-3)]">
              Your professional account is verified. Start browsing available jobs and growing your business on Feazy.
            </p>
            <Link
              href="/professional"
              className="mt-6 flex min-h-[54px] w-full items-center justify-center rounded-2xl bg-green-600 px-5 text-base font-bold text-white shadow-[0_12px_26px_rgba(34,197,94,0.18)] transition hover:-translate-y-0.5 hover:bg-green-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2"
            >
              Go to Dashboard →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[var(--color-porcelain)] to-[var(--color-paper)] px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-[var(--font-display)] text-4xl font-bold leading-none tracking-[-0.06em] text-[var(--color-ink)]">
            Welcome, {displayName}
          </h1>
          <p className="mt-4 text-lg text-[var(--color-ink-3)]">
            {yearsExperience} years of experience
          </p>
        </div>

        {/* Status Card */}
        <div className={`rounded-[28px] border-2 p-8 mb-8 ${getStatusColor(verificationStatus)}`}>
          <div className="flex items-start gap-4">
            <div className="text-5xl flex-shrink-0">{getStatusIcon(verificationStatus)}</div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-[var(--color-ink)]">
                {statusInfo.title}
              </h2>
              <p className="mt-2 text-[var(--color-ink-2)]">
                {statusInfo.description}
              </p>
              {submittedAt && (
                <p className="mt-3 text-sm text-[var(--color-ink-4)]">
                  Submitted on {new Date(submittedAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Action Section */}
        {verificationStatus === 'pending' && (
          <VerificationUpload
            onSubmitted={() => setSubmitSuccess(true)}
          />
        )}

        {(verificationStatus === 'documents_submitted' || verificationStatus === 'under_review') && (
          <div className="rounded-[28px] border border-[var(--color-line)] bg-[var(--color-paper)] p-8 shadow-[0_24px_70px_rgba(24,33,31,0.09)]">
            <h3 className="text-xl font-bold text-[var(--color-ink)] mb-4">
              Your verification is in progress
            </h3>
            <p className="text-[var(--color-ink-2)] mb-6">
              We're reviewing your credentials. This usually takes 1-2 business days. You'll receive an email notification as soon as your account is verified.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                💡 In the meantime, you can set up your profile, add your skills, and configure your availability for when you're verified.
              </p>
            </div>
          </div>
        )}

        {verificationStatus === 'rejected' && (
          <div className="rounded-[28px] border border-[var(--color-line)] bg-[var(--color-paper)] p-8 shadow-[0_24px_70px_rgba(24,33,31,0.09)]">
            <h3 className="text-xl font-bold text-red-600 mb-4">
              Verification Could Not Be Completed
            </h3>
            {rejectionReason && (
              <p className="text-[var(--color-ink-2)] mb-6">
                <strong>Reason:</strong> {rejectionReason}
              </p>
            )}
            <p className="text-[var(--color-ink-2)] mb-6">
              Please contact our support team for more information or to reapply.
            </p>
            <a
              href="mailto:support@feasy.com"
              className="inline-flex items-center justify-center min-h-[54px] rounded-2xl bg-[var(--color-teal)] px-5 text-base font-bold text-white shadow-[0_12px_26px_rgba(23,107,91,0.18)] transition hover:-translate-y-0.5 hover:bg-[var(--color-teal-deep)]"
            >
              Contact Support →
            </a>
          </div>
        )}

        {verificationStatus === 'suspended' && (
          <div className="rounded-[28px] border border-red-200 bg-red-50 p-8 shadow-[0_24px_70px_rgba(24,33,31,0.09)]">
            <h3 className="text-xl font-bold text-red-600 mb-4">
              Account Suspended
            </h3>
            <p className="text-red-900 mb-6">
              Your account has been suspended. Please contact our support team immediately.
            </p>
            <a
              href="mailto:support@feasy.com"
              className="inline-flex items-center justify-center min-h-[54px] rounded-2xl bg-red-600 px-5 text-base font-bold text-white shadow-[0_12px_26px_rgba(220,38,38,0.18)] transition hover:-translate-y-0.5 hover:bg-red-700"
            >
              Contact Support →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
