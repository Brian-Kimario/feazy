import { getCommunications } from '@/lib/services/admin-communications';
import { isAdminFailure } from '@/lib/admin/result';

export const metadata = { title: 'Communications — Feasy Admin' };
export const dynamic = 'force-dynamic';

const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const label = (s: string) => s.replace(/_/g, ' ');

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {note && <p className="mb-2 text-xs text-ink-3">{note}</p>}
      {children}
    </section>
  );
}
const Empty = ({ text }: { text: string }) => <div className="rounded-xl border border-line bg-paper p-6 text-center text-sm text-ink-3">{text}</div>;

export default async function AdminCommunicationsPage() {
  const result = await getCommunications();
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
      <div className="mb-6">
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.11em] text-ink-3">Admin · Communications</div>
        <h1 className="text-3xl font-bold text-ink md:text-4xl">Communications</h1>
        <p className="mt-1 text-ink-2">Read-only delivery health and contact-form inbox. Message contents and job chats are not shown here.</p>
      </div>

      {isAdminFailure(result) ? (
        <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft p-6 text-danger">
          <p className="font-bold">Could not load communications</p>
          <p className="text-sm">{result.error} This is not an empty list.</p>
        </div>
      ) : (
        <>
          {(result.data.statusCounts.pending ?? 0) > 0 && !(result.data.statusCounts.sent || result.data.statusCounts.delivered) && (
            <div role="status" className="mb-6 rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm text-ink">
              <p className="font-bold">External delivery is not operating</p>
              <p className="mt-1 text-ink-2">
                Queued rows are written when a job changes state, but no worker sends them: nothing has ever been recorded as sent, delivered or failed.
                Customers are not receiving WhatsApp, SMS or email from these rows. In-app notifications are a separate path.
              </p>
            </div>
          )}

          <dl className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            {Object.entries(result.data.statusCounts).map(([s, n]) => (
              <div key={s} className="rounded-xl border border-line bg-paper p-4">
                <dt className="text-xs font-bold capitalize text-ink-3">Notifications {label(s)}</dt>
                <dd className="text-2xl font-bold text-ink">{n}</dd>
              </div>
            ))}
            <div className="rounded-xl border border-line bg-paper p-4">
              <dt className="text-xs font-bold text-ink-3">Unresolved delivery failures</dt>
              <dd className="text-2xl font-bold text-ink">{result.data.openFailures}</dd>
            </div>
          </dl>

          <Section title="Delivery failures" note="Notifications that could not be delivered and are not marked resolved.">
            {result.data.failures.length === 0 ? <Empty text="No unresolved failures." /> : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
                {result.data.failures.map((f) => (
                  <li key={f.id} className="grid gap-1 px-4 py-3 text-sm md:grid-cols-[1fr_1fr_auto_auto]">
                    <span className="font-bold capitalize text-ink">{label(f.source)}</span>
                    <span className="text-ink-2">{f.code ?? 'No error code'}</span>
                    <span className="text-xs text-ink-3">{f.attempts} {f.attempts === 1 ? 'attempt' : 'attempts'}</span>
                    <span className="text-xs text-ink-3">{when(f.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Recent notifications" note="Latest 25. “Pending” means queued and not yet recorded as sent.">
            {result.data.notifications.length === 0 ? <Empty text="No notifications yet." /> : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
                {result.data.notifications.map((n) => (
                  <li key={n.id} className="grid gap-1 px-4 py-3 text-sm md:grid-cols-[1.4fr_1fr_1fr_auto]">
                    <span className="font-bold capitalize text-ink">{label(n.type)}</span>
                    <span className="text-ink-2">{n.channel ?? 'No channel yet'}</span>
                    <span className="capitalize text-ink-2">{n.status}</span>
                    <span className="text-xs text-ink-3">{when(n.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Contact messages" note={`${result.data.contactTotal} total. Subject and status only; message text is not shown.`}>
            {result.data.contacts.length === 0 ? <Empty text="No contact messages." /> : (
              <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-paper">
                {result.data.contacts.map((c) => (
                  <li key={c.id} className="grid gap-1 px-4 py-3 text-sm md:grid-cols-[1fr_1fr_1fr_auto]">
                    <span className="font-bold text-ink">{c.reference}</span>
                    <span className="capitalize text-ink-2">{label(c.topic)}</span>
                    <span className="text-ink-2">{c.name} · {c.status}</span>
                    <span className="text-xs text-ink-3">{when(c.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
