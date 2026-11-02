import Link from 'next/link';
import { Mail, ArrowRight } from 'lucide-react';
import { Symbol } from '@/components/brand/Symbol';

export const metadata = {
  title: 'Check your email — Feazy',
};

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-[#0a0b0d] flex flex-col">
      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#5fe3b0]/6 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <div className="relative z-10 flex justify-center pt-8">
        <Link href="/" className="flex items-center gap-2 group">
          <Symbol size="md" className="h-8 w-8 transition-transform group-hover:scale-105" />
          <span className="font-bold text-[#f4f5f3] text-lg tracking-tight">Feazy</span>
        </Link>
      </div>

      {/* Content */}
      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center space-y-8">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="w-20 h-20 bg-[#5fe3b0]/10 border border-[#5fe3b0]/25 rounded-2xl flex items-center justify-center">
              <Mail className="w-10 h-10 text-[#5fe3b0]" strokeWidth={1.5} />
            </div>
          </div>

          {/* Copy */}
          <div className="space-y-3">
            <h1 className="font-bold text-3xl text-[#f4f5f3] tracking-tight">Check your email</h1>
            <p className="text-[#a0a8b0] text-base leading-relaxed">
              We've sent a confirmation link to your inbox. Click it to activate your account and get started.
            </p>
          </div>

          {/* Card */}
          <div className="bg-[#15171c] border border-[#262a31] rounded-2xl p-6 text-left space-y-3">
            <p className="text-[#f4f5f3] text-sm font-semibold">What happens next:</p>
            {[
              'Open the email from Feazy',
              'Click the "Confirm account" link',
              'You\'ll be redirected to your dashboard',
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-[#5fe3b0]/15 border border-[#5fe3b0]/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[#5fe3b0] text-[10px] font-bold">{i + 1}</span>
                </div>
                <p className="text-[#a0a8b0] text-sm">{step}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            <Link
              href="/auth/login"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#5fe3b0] hover:text-[#4ecf9f] transition-colors group"
            >
              Back to sign in
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
