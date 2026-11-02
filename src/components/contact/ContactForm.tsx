'use client';

import Link from 'next/link';
import { useRef, useState, useTransition, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, Copy } from 'lucide-react';
import { authInput } from '@/components/auth/auth-shell';
import { submitContactMessageAction } from '@/lib/contact/actions';
import { TOPIC_COPY } from '@/lib/contact/rules';
import { CONTACT_TOPICS, type ContactTopic } from '@/validators/contact';

interface ContactFormProps {
  defaultName: string;
  defaultEmail: string;
  signedIn: boolean;
}

export function ContactForm({ defaultName, defaultEmail, signedIn }: ContactFormProps) {
  const [topic, setTopic] = useState<ContactTopic | ''>('');
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [bookingRef, setBookingRef] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFailure(null);
    startTransition(async () => {
      const result = await submitContactMessageAction({ topic, name, email, bookingRef, message, website });
      if (result.success === false) {
        setFieldErrors(result.fieldErrors ?? {});
        setFailure(result.code === 'invalid_input' ? 'Please fix the highlighted fields.' : result.error);
        return;
      }
      setFieldErrors({});
      setReference(result.data.reference);
      setTimeout(() => headingRef.current?.focus(), 0);
    });
  }

  async function copyReference() {
    if (!reference) return;
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  if (reference) {
    return (
      <div className="rounded-2xl border border-line bg-paper p-6 sm:p-8">
        <span className="grid size-14 place-items-center rounded-2xl bg-teal-wash text-teal">
          <CheckCircle2 size={26} aria-hidden="true" />
        </span>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-5 font-editorial text-[30px] leading-tight outline-none"
        >
          Message received.
        </h2>
        <p role="status" className="mt-2 text-[15px] text-ink-3">
          We will reply to <span className="font-semibold text-ink">{email.trim()}</span>. Quote this reference if you
          write to us again.
        </p>
        <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-porcelain px-4 py-3 ring-1 ring-line-strong">
          <span className="font-mono text-[17px] font-semibold tracking-wide">{reference}</span>
          <button
            type="button"
            onClick={() => void copyReference()}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 px-2 text-[14px] font-semibold text-teal hover:text-teal-deep"
          >
            <Copy size={15} aria-hidden="true" />
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/help"
            className="inline-flex min-h-12 flex-1 items-center justify-center rounded-xl border border-line-strong bg-paper text-[15px] font-semibold hover:border-ink-3"
          >
            Browse help
          </Link>
          <button
            type="button"
            onClick={() => {
              setReference(null);
              setMessage('');
              setBookingRef('');
              setTopic('');
              setCopied(false);
            }}
            className="inline-flex min-h-12 flex-1 cursor-pointer items-center justify-center rounded-xl border border-line-strong bg-paper text-[15px] font-semibold hover:border-ink-3"
          >
            Send another
          </button>
        </div>
      </div>
    );
  }

  const err = (field: string) => fieldErrors[field]?.[0];
  const label = 'text-[13.5px] font-semibold';
  const border = (field: string) => (err(field) ? 'border-clay' : 'border-line-strong');

  return (
    <form onSubmit={submit} noValidate className="rounded-2xl border border-line bg-paper p-5 sm:p-8">
      <fieldset>
        <legend className={label}>What is this about?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CONTACT_TOPICS.map((id) => (
            <label
              key={id}
              className={`flex min-h-14 cursor-pointer flex-col justify-center rounded-xl border px-3 py-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-teal ${
                topic === id ? 'border-teal bg-teal-wash' : 'border-line-strong bg-paper hover:border-ink-3'
              }`}
            >
              <input
                type="radio"
                name="topic"
                value={id}
                checked={topic === id}
                onChange={() => setTopic(id)}
                className="sr-only"
              />
              <span className="text-[14px] font-semibold">{TOPIC_COPY[id].label}</span>
              <span className="hidden text-[12px] text-ink-3 sm:block">{TOPIC_COPY[id].hint}</span>
            </label>
          ))}
        </div>
        {err('topic') && (
          <p role="alert" className="mt-1.5 text-[13px] text-clay">
            {err('topic')}
          </p>
        )}
      </fieldset>

      <div className="mt-5 grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="c-name" className={label}>
            Your name
          </label>
          <input
            id="c-name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-invalid={Boolean(err('name'))}
            className={`${authInput} ${border('name')}`}
          />
          {err('name') && <p role="alert" className="mt-1.5 text-[13px] text-clay">{err('name')}</p>}
        </div>
        <div>
          <label htmlFor="c-email" className={label}>
            Email
          </label>
          <input
            id="c-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={Boolean(err('email'))}
            className={`${authInput} ${border('email')}`}
          />
          {err('email') && <p role="alert" className="mt-1.5 text-[13px] text-clay">{err('email')}</p>}
        </div>
      </div>

      {(topic === 'booking' || topic === 'payment' || topic === 'professional') && (
        <div className="mt-5">
          <label htmlFor="c-ref" className={label}>
            Booking reference <span className="font-normal text-ink-3">(optional)</span>
          </label>
          <input
            id="c-ref"
            value={bookingRef}
            onChange={(e) => setBookingRef(e.target.value)}
            placeholder="Shown on your booking page"
            className={`${authInput} ${border('bookingRef')}`}
          />
          {err('bookingRef') && <p role="alert" className="mt-1.5 text-[13px] text-clay">{err('bookingRef')}</p>}
        </div>
      )}

      <div className="mt-5">
        <label htmlFor="c-message" className={label}>
          Message
        </label>
        <textarea
          id="c-message"
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-invalid={Boolean(err('message'))}
          className={`${authInput} h-auto py-3 ${border('message')}`}
        />
        <div className="mt-1.5 flex justify-between gap-3 text-[13px]">
          {err('message') ? (
            <p role="alert" className="text-clay">{err('message')}</p>
          ) : (
            <span />
          )}
          <span className="text-ink-4">{message.length}/3000</span>
        </div>
      </div>

      {/* Honeypot: hidden from people and assistive tech. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="c-website">Website</label>
        <input id="c-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </div>

      {failure && (
        <p role="alert" className="mt-5 rounded-xl border border-clay/30 bg-clay/10 px-4 py-3 text-[14px] text-clay">
          {failure}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-teal text-[15px] font-semibold text-porcelain transition-colors hover:bg-teal-deep disabled:opacity-70"
      >
        {pending ? 'Sending…' : 'Send message'}
        {!pending && <ArrowRight size={16} aria-hidden="true" />}
      </button>
      {signedIn && (
        <p className="mt-3 text-center text-[12.5px] text-ink-4">Sent as your signed-in account.</p>
      )}
    </form>
  );
}
