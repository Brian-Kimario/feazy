import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginPageClient } from '@/components/pages/LoginPageClient';

export const metadata: Metadata = {
  title: 'Sign In | Feazy',
  description: 'Sign in to your Feazy account to manage property maintenance requests',
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="animate-spin">Loading...</div></div>}>
      <LoginPageClient />
    </Suspense>
  );
}
