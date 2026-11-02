'use client';

import React, { useEffect, useRef } from 'react';
import { animate } from 'animejs';
import Link from 'next/link';
import { 
  CheckCircle2, 
  Clock, 
  FileText, 
  AlertCircle, 
  ArrowUpRight, 
  Wrench,
  ShieldCheck,
  Calendar
} from 'lucide-react';

export interface ActivityItem {
  id: string;
  type: 'job_completed' | 'quote_submitted' | 'invoice_ready' | 'pro_assigned' | 'booking_scheduled';
  title: string;
  description: string;
  timestamp: string; // e.g. "25m ago", "2h ago", "Yesterday"
  reference?: string;
  link?: string;
}

interface RecentActivityListProps {
  activities?: ActivityItem[];
  className?: string;
}

const DEFAULT_ACTIVITIES: ActivityItem[] = [
  {
    id: 'act-1',
    type: 'quote_submitted',
    title: 'Quote submitted for extra work',
    description: 'Dario Venn submitted parts & labor authorization for FX-4821.',
    timestamp: '25m ago',
    reference: 'FX-4821',
    link: '#quote',
  },
  {
    id: 'act-2',
    type: 'pro_assigned',
    title: 'Technician assigned & verified',
    description: 'Master Plumber Dario Venn confirmed arrival window for 11:30.',
    timestamp: '2h ago',
    reference: 'FX-4821',
    link: '/customer/bookings',
  },
  {
    id: 'act-3',
    type: 'job_completed',
    title: 'Repair completed & certified',
    description: 'Quarter-turn shutoff valve renewal inspected and pressure tested.',
    timestamp: 'Yesterday',
    reference: 'FX-4310',
    link: '/customer/bookings',
  },
  {
    id: 'act-4',
    type: 'invoice_ready',
    title: 'Invoice generated & receipt stored',
    description: 'Payment processed for ₹145.00 with 12-month Feazy Warranty.',
    timestamp: '3 days ago',
    reference: 'INV-9021',
    link: '/customer/bookings',
  },
];

export function RecentActivityList({ activities = DEFAULT_ACTIVITIES, className = '' }: RecentActivityListProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Stagger animation on mount using Anime.js
  useEffect(() => {
    if (listRef.current) {
      animate(listRef.current.querySelectorAll('.activity-card'), {
        opacity: [0, 1],
        translateX: [-12, 0],
        delay: (el: unknown, i: number) => i * 65,
        duration: 250,
        ease: 'outQuad',
      });
    }
  }, [activities]);

  const getIcon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'job_completed':
        return <CheckCircle2 className="w-4 h-4 text-[#2F7D5B]" />;
      case 'quote_submitted':
        return <AlertCircle className="w-4 h-4 text-[#9B6A1E]" />;
      case 'invoice_ready':
        return <FileText className="w-4 h-4 text-[#416B84]" />;
      case 'pro_assigned':
        return <Wrench className="w-4 h-4 text-[#176B5B]" />;
      case 'booking_scheduled':
        return <Calendar className="w-4 h-4 text-[#176B5B]" />;
      default:
        return <Clock className="w-4 h-4 text-[#7C8681]" />;
    }
  };

  const getBadgeStyle = (type: ActivityItem['type']) => {
    switch (type) {
      case 'job_completed':
        return 'bg-[#E2EEE9] border-[#BCD4CC] text-[#2F7D5B]';
      case 'quote_submitted':
        return 'bg-[#F5EBD7] border-[#DDCCAB] text-[#9B6A1E]';
      case 'invoice_ready':
        return 'bg-[#E6EEF2] border-[#BCD0DB] text-[#416B84]';
      default:
        return 'bg-[#F7F4EC] border-[#D9DED8] text-[#5A6661]';
    }
  };

  return (
    <div className={`bg-[#FFFEFA] border border-[#D9DED8] rounded-[20px] p-5 sm:p-6 shadow-[0_4px_24px_rgba(24,33,31,0.03)] ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#D9DED8]">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7C8681] block mb-0.5">
            LOGGED EVENTS
          </span>
          <h3 className="text-base sm:text-lg font-bold text-[#18211F]">
            Recent Activity
          </h3>
        </div>
        <Link
          href="/customer/bookings"
          className="inline-flex items-center gap-1 text-xs font-bold text-[#176B5B] hover:text-[#0D5144] tracking-wide"
        >
          <span>All history</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Activity List */}
      <div ref={listRef} className="divide-y divide-[#D9DED8]/60 mt-2">
        {activities.map((item) => (
          <div
            key={item.id}
            className="activity-card py-3.5 flex items-start gap-3 group hover:bg-[#F7F4EC]/50 rounded-xl px-2.5 -mx-2.5 transition-colors"
          >
            {/* Semantic Icon Circle */}
            <div className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 mt-0.5 ${getBadgeStyle(item.type)}`}>
              {getIcon(item.type)}
            </div>

            {/* Event Description */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs sm:text-sm font-bold text-[#18211F] group-hover:text-[#176B5B] transition-colors truncate">
                  {item.title}
                </h4>
                <span className="text-[11px] text-[#7C8681] whitespace-nowrap flex-shrink-0">
                  {item.timestamp}
                </span>
              </div>

              <p className="text-xs text-[#5A6661] mt-0.5 line-clamp-2 leading-relaxed">
                {item.description}
              </p>

              {item.reference && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-[#F7F4EC] border border-[#D9DED8] text-[#5A6661]">
                    {item.reference}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
