import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { RegisterPageClient } from '@/components/pages/RegisterPageClient';

export const metadata: Metadata = {
  title: 'Create Account | Feazy',
  description: 'Sign up as a customer to start requesting property maintenance services on Feazy',
  robots: {
    index: false,
    follow: false,
  },
};

export const dynamic = 'force-dynamic';

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  if (as === 'professional') redirect('/auth/register/professional');
  return <RegisterPageClient />;
}
