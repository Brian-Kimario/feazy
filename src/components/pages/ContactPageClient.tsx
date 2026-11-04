import Link from 'next/link';
import { ArrowRight, BookOpen, ShieldAlert } from 'lucide-react';
import { ContactForm } from '@/components/contact/ContactForm';

interface ContactPageClientProps {
  defaultName: string;
  defaultEmail: string;
  signedIn: boolean;
}

export function ContactPageClient(props: ContactPageClientProps) {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:pt-12">
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-teal">Contact</p>
      <h1 className="mt-3 font-editorial text-[clamp(32px,6vw,48px)] font-normal leading-[1.05] tracking-[-0.02em]">
        Talk to a person.
      </h1>
      <p className="mt-3 max-w-xl text-[15px] text-ink-3">
        Tell us what happened and we will read it and reply by email.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <ContactForm {...props} />

        <aside className="space-y-4 lg:order-last">
          <div className="rounded-2xl border border-clay/30 bg-clay/10 p-5">
            <ShieldAlert size={20} aria-hidden="true" className="text-clay" />
            <h2 className="mt-2 text-[15px] font-semibold">Emergency?</h2>
            <p className="mt-1 text-[14px] text-ink-2">
              For a gas leak, exposed wiring or flooding, leave the area and call 112. Do not wait for a reply.
            </p>
          </div>
          <Link
            href="/help"
            className="block rounded-2xl border border-line bg-paper p-5 transition-colors hover:border-ink-3"
          >
            <BookOpen size={20} aria-hidden="true" className="text-teal" />
            <h2 className="mt-2 text-[15px] font-semibold">Check the help centre first</h2>
            <p className="mt-1 text-[14px] text-ink-3">Codes, quotes, payment and no-shows are answered there.</p>
            <span className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-teal">
              Open help <ArrowRight size={15} aria-hidden="true" />
            </span>
          </Link>
          <p className="px-1 text-[13px] text-ink-3">
            Prefer email? Write to <span className="font-semibold text-ink">support@feazy.com</span>.
          </p>
        </aside>
      </div>
    </div>
  );
}
