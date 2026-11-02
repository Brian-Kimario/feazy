'use client';

import React, { useState, useRef, useEffect } from 'react';
import { animate } from 'animejs';
import { 
  Wrench, 
  Calendar, 
  CheckCircle2, 
  ShieldCheck, 
  FileText, 
  ExternalLink,
  ChevronDown,
  Sparkles,
  Download,
  AlertCircle
} from 'lucide-react';
import { formatCurrency } from '@/lib/currency';

export interface TimelineEvent {
  id: string;
  date: string; // e.g. "Oct 2026" or "12 Mar 2026"
  fullDate: string; // e.g. "March 12, 2026"
  category: 'Plumbing' | 'Electrical' | 'HVAC' | 'Appliances' | 'Safety';
  title: string;
  propertyName: string;
  summary: string;
  findings?: string;
  partsReplaced?: string[];
  cost?: number;
  proName: string;
  proRating: number;
  warrantyValidUntil?: string;
  referenceNumber: string;
}

interface PropertyMaintenanceTimelineProps {
  events?: TimelineEvent[];
  className?: string;
}

const CATEGORIES = ['All', 'Plumbing', 'Electrical', 'HVAC', 'Appliances'] as const;
type CategoryFilter = typeof CATEGORIES[number];

const DEFAULT_EVENTS: TimelineEvent[] = [
  {
    id: 'evt-1',
    date: 'OCT 2026',
    fullDate: 'October 1, 2026',
    category: 'Plumbing',
    title: 'Dual Shut-Off Valve & Supply Line Renewal',
    propertyName: 'Oakwood Residence',
    summary: 'Proactive replacement of corroded brass shut-off valves under vanity.',
    findings: 'Found micro-seepage behind drywall escutcheon plate. Replaced with heavy-duty quarter-turn ball valves and braided stainless steel flex lines.',
    partsReplaced: ['2x 1/2" Compression Quarter-Turn Valves', '2x Stainless Steel 20" Supply Hoses'],
    cost: 145.0,
    proName: 'Dario Venn',
    proRating: 4.95,
    warrantyValidUntil: 'Oct 2027',
    referenceNumber: 'FX-4821',
  },
  {
    id: 'evt-2',
    date: 'JUL 2026',
    fullDate: 'July 14, 2026',
    category: 'HVAC',
    title: 'Mid-Summer Heat Pump Diagnostics & Filter Overhaul',
    propertyName: 'Oakwood Residence',
    summary: 'Comprehensive airflow balancing and evaporator coil sanitize.',
    findings: 'Refrigerant pressure nominal (118 PSI suction). High-efficiency MERV 13 media filter replaced. Condensate trap cleared of algae buildup.',
    partsReplaced: ['MERV 13 Air Media Filter', 'Algae Clear Condensate Tablets'],
    cost: 190.0,
    proName: 'Elena Rostova',
    proRating: 4.98,
    warrantyValidUntil: 'July 2027',
    referenceNumber: 'FX-4310',
  },
  {
    id: 'evt-3',
    date: 'MAR 2026',
    fullDate: 'March 22, 2026',
    category: 'Electrical',
    title: 'Dedicated 20A Circuit & GFCI In-Kitchen Upgrade',
    propertyName: 'Oakwood Residence',
    summary: 'Installed dual tamper-resistant GFCI outlets for countertop safety compliance.',
    findings: 'Previous line was ungrounded BX cable. Pulled new Romex run to primary panel and tagged circuit 14.',
    partsReplaced: ['Leviton 20A GFCI Spec Grade', '12/2 NM-B Wire Run (35ft)'],
    cost: 260.0,
    proName: 'Kareem Wells',
    proRating: 4.9,
    warrantyValidUntil: 'March 2028',
    referenceNumber: 'FX-3904',
  },
  {
    id: 'evt-4',
    date: 'NOV 2025',
    fullDate: 'November 8, 2025',
    category: 'Plumbing',
    title: 'Main Sewer Lateral Camera Inspection & Jetting',
    propertyName: 'Oakwood Residence',
    summary: 'Hydro-jet clearing of root intrusion near city main connection.',
    findings: 'High-definition optical scope revealed minor root penetration at cleanout collar. High pressure jetting restored 100% volumetric flow.',
    partsReplaced: ['Cleanout Cap & Seal Gasket'],
    cost: 320.0,
    proName: 'Dario Venn',
    proRating: 4.95,
    warrantyValidUntil: 'Nov 2026',
    referenceNumber: 'FX-3120',
  },
];

export function PropertyMaintenanceTimeline({ events = DEFAULT_EVENTS, className = '' }: PropertyMaintenanceTimelineProps) {
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('All');
  const [selectedEventId, setSelectedEventId] = useState<string>(events[0]?.id || '');
  const [expandedMobileId, setExpandedMobileId] = useState<string | null>(events[0]?.id || null);

  const containerRef = useRef<HTMLDivElement>(null);
  const detailPanelRef = useRef<HTMLDivElement>(null);

  const filteredEvents = selectedCategory === 'All' 
    ? events 
    : events.filter((e) => e.category.toLowerCase().includes(selectedCategory.toLowerCase()));

  const activeEvent = events.find((e) => e.id === selectedEventId) || filteredEvents[0] || null;

  // Animate content transition on category change (250-350ms)
  useEffect(() => {
    if (containerRef.current) {
      animate(containerRef.current.querySelectorAll('.timeline-node'), {
        opacity: [0, 1],
        translateY: [8, 0],
        delay: (el: unknown, i: number) => i * 40,
        duration: 300,
        ease: 'outQuad',
      });
    }
  }, [selectedCategory]);

  // Animate detail panel updates
  useEffect(() => {
    if (detailPanelRef.current) {
      animate(detailPanelRef.current, {
        opacity: [0.3, 1],
        translateX: [10, 0],
        duration: 280,
        ease: 'outQuad',
      });
    }
  }, [selectedEventId]);

  return (
    <div className={`bg-[#FFFEFA] border border-[#D9DED8] rounded-[22px] p-6 sm:p-7 shadow-[0_4px_24px_rgba(24,33,31,0.03)] ${className}`}>
      {/* Header & Category Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-[#D9DED8]">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#7C8681] block mb-1">
            VERIFIED ASSET HISTORY
          </span>
          <h3 className="text-xl sm:text-2xl font-bold text-[#18211F] tracking-tight">
            Property Maintenance Timeline
          </h3>
          <p className="text-xs sm:text-sm text-[#5A6661] mt-0.5">
            Every repair, certified inspection, and replaced part builds your property’s verifiable health record.
          </p>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                selectedCategory === cat
                  ? 'bg-[#176B5B] text-white shadow-[0_4px_12px_rgba(23,107,91,0.15)]'
                  : 'bg-[#F7F4EC] text-[#5A6661] hover:text-[#18211F] hover:bg-[#EAE6DC]'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Main 2-Column Split: Left Timeline Rail / Right Deep Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-6" ref={containerRef}>
        {/* Left Column: Timeline Rail (lg:col-span-7) */}
        <div className="lg:col-span-7 relative">
          {filteredEvents.length === 0 ? (
            <div className="py-12 text-center">
              <AlertCircle className="w-8 h-8 text-[#7C8681] mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold text-[#18211F]">No records in this category</p>
              <p className="text-xs text-[#5A6661] mt-1">Book an inspection to start logging verified records.</p>
            </div>
          ) : (
            <div className="relative pl-6 before:content-[''] before:absolute before:left-[11px] before:top-3 before:bottom-3 before:w-[2px] before:bg-gradient-to-b before:from-[#176B5B] before:via-[#D9DED8] before:to-transparent">
              {filteredEvents.map((evt) => {
                const isSelected = activeEvent?.id === evt.id;
                const isMobileOpen = expandedMobileId === evt.id;

                return (
                  <div
                    key={evt.id}
                    className="timeline-node relative mb-6 last:mb-0 group cursor-pointer"
                    onClick={() => {
                      setSelectedEventId(evt.id);
                      setExpandedMobileId(isMobileOpen ? null : evt.id);
                    }}
                  >
                    {/* Node Dot */}
                    <div
                      className={`absolute -left-[30px] top-1.5 w-4 h-4 rounded-full border-2 transition-all ${
                        isSelected
                          ? 'bg-[#176B5B] border-white shadow-[0_0_0_4px_rgba(23,107,91,0.25)] scale-110'
                          : 'bg-[#FFFEFA] border-[#7C8681] group-hover:border-[#176B5B]'
                      }`}
                    />

                    {/* Timeline Item Card */}
                    <div
                      className={`p-4 rounded-xl border transition-all ${
                        isSelected
                          ? 'border-[#176B5B] bg-[#F7F4EC]/60 shadow-[0_4px_16px_rgba(24,33,31,0.04)]'
                          : 'border-[#D9DED8] bg-[#FFFEFA] hover:border-[#BCD4CC]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#E2EEE9] text-[#176B5B]">
                            {evt.category}
                          </span>
                          <span className="text-xs font-semibold text-[#7C8681]">
                            {evt.date}
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold text-[#18211F]">
                          {evt.referenceNumber}
                        </span>
                      </div>

                      <h4 className="text-sm sm:text-base font-bold text-[#18211F] group-hover:text-[#176B5B] transition-colors">
                        {evt.title}
                      </h4>

                      <p className="text-xs text-[#5A6661] mt-1 line-clamp-2 leading-relaxed">
                        {evt.summary}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-[#7C8681] mt-3 pt-2.5 border-t border-[#D9DED8]/60">
                        <span>Technician: {evt.proName}</span>
                        {evt.cost && <span className="font-bold text-[#18211F]">{formatCurrency(evt.cost)}</span>}
                      </div>

                      {/* Mobile Accordion Detail View */}
                      <div className="lg:hidden">
                        {isMobileOpen && (
                          <div className="mt-4 pt-4 border-t border-[#D9DED8] text-xs text-[#5A6661] space-y-2">
                            {evt.findings && (
                              <div>
                                <span className="font-bold text-[#18211F] block mb-0.5">Inspection Finding:</span>
                                <p>{evt.findings}</p>
                              </div>
                            )}
                            {evt.partsReplaced && evt.partsReplaced.length > 0 && (
                              <div>
                                <span className="font-bold text-[#18211F] block mb-0.5">Parts Replaced:</span>
                                <ul className="list-disc list-inside">
                                  {evt.partsReplaced.map((p, i) => (
                                    <li key={i}>{p}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Desktop Detail Panel (lg:col-span-5) */}
        <div className="hidden lg:block lg:col-span-5">
          {activeEvent ? (
            <div
              ref={detailPanelRef}
              className="sticky top-28 bg-[#F7F4EC] border border-[#D9DED8] rounded-[18px] p-5 shadow-sm"
            >
              <div className="flex items-center justify-between pb-3 border-b border-[#D9DED8]">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#176B5B]">
                  <ShieldCheck className="w-4 h-4 text-[#176B5B]" />
                  <span>Feazy Certified Record</span>
                </div>
                <span className="text-xs font-mono text-[#7C8681]">{activeEvent.referenceNumber}</span>
              </div>

              <div className="my-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#7C8681]">
                  {activeEvent.fullDate}
                </span>
                <h4 className="text-base font-bold text-[#18211F] mt-1 leading-snug">
                  {activeEvent.title}
                </h4>
                <p className="text-xs text-[#5A6661] mt-1">{activeEvent.propertyName}</p>
              </div>

              {/* Inspection Finding */}
              {activeEvent.findings && (
                <div className="mb-4 bg-[#FFFEFA] border border-[#D9DED8] rounded-xl p-3.5">
                  <span className="text-[11px] font-bold text-[#18211F] block mb-1">
                    Inspection Findings & Notes
                  </span>
                  <p className="text-xs text-[#5A6661] leading-relaxed">
                    {activeEvent.findings}
                  </p>
                </div>
              )}

              {/* Parts Installed */}
              {activeEvent.partsReplaced && activeEvent.partsReplaced.length > 0 && (
                <div className="mb-4">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#7C8681] block mb-1.5">
                    Components & Materials
                  </span>
                  <div className="space-y-1.5">
                    {activeEvent.partsReplaced.map((part, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-xs bg-[#FFFEFA] border border-[#D9DED8]/70 px-2.5 py-1.5 rounded-lg text-[#18211F]"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#2F7D5B] flex-shrink-0" />
                        <span>{part}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Warranty Guarantee */}
              {activeEvent.warrantyValidUntil && (
                <div className="p-3 rounded-xl bg-[#E2EEE9] border border-[#BCD4CC] flex items-center justify-between text-xs mb-4">
                  <div>
                    <span className="font-bold text-[#176B5B] block">Feazy Warranty Active</span>
                    <span className="text-[11px] text-[#5A6661]">Protected through {activeEvent.warrantyValidUntil}</span>
                  </div>
                  <ShieldCheck className="w-5 h-5 text-[#176B5B]" />
                </div>
              )}

              {/* Pro Signature & Certificate */}
              <div className="pt-3 border-t border-[#D9DED8] flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] text-[#7C8681] block">Executed by</span>
                  <span className="font-bold text-[#18211F]">{activeEvent.proName} (★ {activeEvent.proRating})</span>
                </div>
                <button
                  type="button"
                  onClick={() => alert(`Downloading verified service certificate for ${activeEvent.referenceNumber}`)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-[#176B5B] hover:text-[#0D5144] py-1 px-2 rounded-lg hover:bg-white/60 transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Certificate</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-[#7C8681] bg-[#F7F4EC] rounded-2xl border border-[#D9DED8]">
              Select any event on the timeline to inspect full documentation and parts registry.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
