export default function AdminLoading() {
  return (
    <div role="status" aria-label="Loading" className="mx-auto max-w-6xl animate-pulse px-4 py-6 md:px-6 md:py-8">
      <div className="mb-2 h-3 w-32 rounded bg-paper-2" />
      <div className="mb-6 h-9 w-64 rounded bg-paper-2" />
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 rounded-xl border border-line bg-paper" />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
