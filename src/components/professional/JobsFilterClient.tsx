'use client';

import { useState, useMemo } from 'react';
import type { Job } from '@/app/professional/types';
import { JobCard } from '@/components/professional/JobCard';

interface JobsFilterClientProps {
  initialJobs: Job[];
}

type FilterTab = 'all' | 'pending' | 'active' | 'completed';

export function JobsFilterClient({ initialJobs }: JobsFilterClientProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Counts for tabs
  const counts = useMemo(() => {
    return {
      all: initialJobs.length,
      pending: initialJobs.filter((j) => ['assigned', 'quote_pending'].includes(j.current_state)).length,
      active: initialJobs.filter((j) => ['accepted', 'on_the_way', 'arrived', 'assessing', 'in_progress'].includes(j.current_state)).length,
      completed: initialJobs.filter((j) => j.current_state === 'completed').length,
    };
  }, [initialJobs]);

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    return initialJobs.filter((job) => {
      // 1. Tab filter
      if (activeTab === 'pending' && !['assigned', 'quote_pending'].includes(job.current_state)) {
        return false;
      }
      if (activeTab === 'active' && !['accepted', 'on_the_way', 'arrived', 'assessing', 'in_progress'].includes(job.current_state)) {
        return false;
      }
      if (activeTab === 'completed' && job.current_state !== 'completed') {
        return false;
      }

      // 2. Search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const serviceName = (job.booking as { service?: { name?: string } })?.service?.name?.toLowerCase() || '';
        const categoryName = (job.booking as { service?: { category?: { name?: string } } })?.service?.category?.name?.toLowerCase() || '';
        const customerName = job.customer?.full_name?.toLowerCase() || '';
        const propertyName = job.property?.name?.toLowerCase() || '';
        const city = (job.property as { address?: { city?: string } })?.address?.city?.toLowerCase() || '';

        return (
          serviceName.includes(q) ||
          categoryName.includes(q) ||
          customerName.includes(q) ||
          propertyName.includes(q) ||
          city.includes(q)
        );
      }

      return true;
    });
  }, [initialJobs, activeTab, searchQuery]);

  return (
    <div className="space-y-6">
      {/* ── Filter Bar ── */}
      <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl p-4 md:p-5 shadow-sm space-y-4">
        {/* Search Input */}
        <div className="relative">
          <svg
            className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7C8681]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search jobs by service, customer name, or address..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#D9DED8] rounded-lg text-sm text-[#18211F] outline-none focus:border-[#176B5B] transition placeholder:text-[#7C8681]"
          />
        </div>

        {/* Tab Filters */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#D9DED8]">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'all'
                ? 'bg-[#176B5B] text-white shadow-sm'
                : 'bg-[#F7F4EC] text-[#5A6661] hover:bg-[#E8EBE7]'
            }`}
          >
            <span>All Jobs</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'all' ? 'bg-white/20 text-white' : 'bg-[#D9DED8] text-[#18211F]'
            }`}>
              {counts.all}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'pending'
                ? 'bg-[#9B6A1E] text-white shadow-sm'
                : 'bg-[#F7F4EC] text-[#5A6661] hover:bg-[#E8EBE7]'
            }`}
          >
            <span>Action Required</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'pending' ? 'bg-white/20 text-white' : 'bg-[#D9DED8] text-[#18211F]'
            }`}>
              {counts.pending}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('active')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'active'
                ? 'bg-[#176B5B] text-white shadow-sm'
                : 'bg-[#F7F4EC] text-[#5A6661] hover:bg-[#E8EBE7]'
            }`}
          >
            <span>Active / On Route</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'active' ? 'bg-white/20 text-white' : 'bg-[#D9DED8] text-[#18211F]'
            }`}>
              {counts.active}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'completed'
                ? 'bg-[#2F7D5B] text-white shadow-sm'
                : 'bg-[#F7F4EC] text-[#5A6661] hover:bg-[#E8EBE7]'
            }`}
          >
            <span>Completed</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
              activeTab === 'completed' ? 'bg-white/20 text-white' : 'bg-[#D9DED8] text-[#18211F]'
            }`}>
              {counts.completed}
            </span>
          </button>
        </div>
      </div>

      {/* ── Jobs List ── */}
      {filteredJobs.length === 0 ? (
        <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl p-12 text-center shadow-sm">
          <div className="w-12 h-12 rounded-xl bg-[#E2EEE9] flex items-center justify-center mx-auto mb-3">
            <svg
              viewBox="0 0 24 24"
              className="w-6 h-6 text-[#176B5B]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
          </div>
          <p className="text-[#18211F] font-bold text-lg mb-1">
            {searchQuery.trim() ? 'No jobs match your search' : 'No jobs in this category'}
          </p>
          <p className="text-[#5A6661] text-xs max-w-sm mx-auto">
            {searchQuery.trim()
              ? `No assigned jobs found matching "${searchQuery}". Try a different keyword.`
              : 'When jobs enter this lifecycle state, they will automatically appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
