import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { Card, Button } from '@/components/ui';
import Link from 'next/link';

export const metadata = {
  title: 'My Bids — Feazy Professional',
};

/** Shape returned by the DB query */
interface BidRow {
  id: string;
  total: number;
  status: string;
  created_at: string;
  reason: string;
  job: {
    id: string;
    current_state: string;
    customer: { full_name: string | null } | null;
    booking: {
      service: { name: string } | null;
    } | null;
  } | null;
}

function getBidStatusBadge(status: string) {
  switch (status) {
    case 'pending_customer':
      return 'bg-yellow-500/20 text-yellow-600';
    case 'approved':
      return 'bg-emerald-500/20 text-emerald-700';
    case 'declined':
      return 'bg-red-500/20 text-red-600';
    case 'expired':
      return 'bg-gray-400/20 text-gray-500';
    case 'cancelled':
      return 'bg-gray-400/20 text-gray-500';
    default:
      return 'bg-gray-100 text-gray-500';
  }
}

function formatBidStatus(status: string) {
  switch (status) {
    case 'pending_customer':
      return 'Awaiting Customer';
    case 'approved':
      return 'Accepted';
    case 'declined':
      return 'Declined';
    case 'expired':
      return 'Expired';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

export default async function MyBidsPage() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) redirect('/auth/login');

  // Fetch this professional's quotes with job/customer/service context
  // RLS ensures only own quotes are returned
  const { data: quotes, error } = await supabase
    .from('quotes')
    .select(`
      id,
      total,
      status,
      reason,
      created_at,
      job:jobs!quotes_job_id_fkey(
        id,
        current_state,
        customer:profiles!jobs_customer_id_fkey(full_name),
        booking:bookings!inner(
          service:services(name)
        )
      )
    `)
    .eq('professional_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('MyBidsPage — quotes fetch error:', error.message);
  }

  const bids: BidRow[] = (quotes ?? []) as unknown as BidRow[];

  const pendingBids = bids.filter((b) => b.status === 'pending_customer').length;
  const acceptedBids = bids.filter((b) => b.status === 'approved').length;
  const totalBids = bids.length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="font-display font-bold text-4xl text-ink mb-2">My Bids</h1>
          <p className="text-[#5A6661] text-lg">Track your proposals and manage accepted jobs</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <div className="space-y-2">
              <p className="text-[#5A6661] text-sm">Total Bids</p>
              <p className="font-display font-bold text-3xl text-ink">{totalBids}</p>
            </div>
          </Card>
          <Card>
            <div className="space-y-2">
              <p className="text-[#5A6661] text-sm">Awaiting Response</p>
              <p className="font-display font-bold text-3xl text-yellow-600">{pendingBids}</p>
            </div>
          </Card>
          <Card>
            <div className="space-y-2">
              <p className="text-[#5A6661] text-sm">Accepted</p>
              <p className="font-display font-bold text-3xl text-emerald-700">{acceptedBids}</p>
            </div>
          </Card>
        </div>

        {/* Bids List */}
        <div className="space-y-4">
          {bids.length === 0 ? (
            <Card>
              <div className="text-center py-12">
                <p className="text-[#5A6661] text-lg">No bids yet</p>
                <p className="text-[#5A6661] text-sm mt-2">
                  Submit quotes on your active jobs to see them here
                </p>
                <Link href="/professional/jobs">
                  <Button variant="primary" size="sm" className="mt-4">
                    View Jobs
                  </Button>
                </Link>
              </div>
            </Card>
          ) : (
            bids.map((bid) => {
              const job = bid.job;
              const booking = Array.isArray(job?.booking) ? job?.booking[0] : job?.booking;
              const service = booking?.service;
              const customer = Array.isArray(job?.customer) ? job?.customer[0] : job?.customer;
              const jobTitle = service?.name ?? 'Home Maintenance';
              const customerName = customer?.full_name ?? 'Homeowner';

              return (
                <Card key={bid.id}>
                  <div className="space-y-4">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="font-display font-bold text-lg text-ink">{jobTitle}</h3>
                          <span
                            className={`px-3 py-1 text-xs rounded font-medium ${getBidStatusBadge(
                              bid.status
                            )}`}
                          >
                            {formatBidStatus(bid.status)}
                          </span>
                        </div>
                        <p className="text-[#5A6661] text-sm mt-2">
                          Customer: {customerName}
                        </p>
                        {bid.reason && (
                          <p className="text-[#5A6661] text-sm mt-1 line-clamp-2">
                            {bid.reason}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-display font-bold text-2xl text-[#176B5B]">
                          ₹{bid.total.toLocaleString('en-IN')}
                        </p>
                        <p className="text-[#5A6661] text-xs mt-1">{timeAgo(bid.created_at)}</p>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-4 border-t border-[#D9DED8]">
                      {job?.id && (
                        <Link href={`/professional/jobs/${job.id}`} className="flex-1">
                          <Button variant="secondary" size="sm" className="w-full">
                            View Job
                          </Button>
                        </Link>
                      )}
                      {bid.status === 'approved' && job?.id && (
                        <Link href={`/professional/jobs/${job.id}`} className="flex-1">
                          <Button variant="primary" size="sm" className="w-full">
                            Go to Job
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
