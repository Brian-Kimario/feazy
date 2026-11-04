'use client';

/**
 * ActiveJobProgressRail — Purposeful micro-animated lifecycle progress stepper.
 * Uses Anime.js to smoothly animate the progress track line fill and pulse
 * the active station marker whenever state transitions occur.
 */

import { useEffect, useRef } from 'react';
import { animate } from 'animejs';

interface ActiveJobProgressRailProps {
  currentState: string;
  className?: string;
}

const STAGES = [
  { key: 'assigned', label: 'Assigned', short: 'Assign' },
  { key: 'accepted', label: 'Accepted', short: 'Accept' },
  { key: 'on_the_way', label: 'On Way', short: 'Transit' },
  { key: 'arrived', label: 'Arrived', short: 'Arrived' },
  { key: 'in_progress', label: 'In Work', short: 'Working' },
  { key: 'completed', label: 'Complete', short: 'Done' },
];

export function ActiveJobProgressRail({ currentState, className = '' }: ActiveJobProgressRailProps) {
  const lineRef = useRef<HTMLDivElement>(null);
  const activeDotRef = useRef<HTMLDivElement>(null);

  // Normalize current stage index
  const stageKeys = STAGES.map((s) => s.key);
  // Assessment and quoting happen on site, so they sit on the "Arrived" stage.
  const currentNormalized = currentState === 'quote_pending' || currentState === 'assessing' ? 'arrived' : currentState;
  const activeIndex = Math.max(0, stageKeys.indexOf(currentNormalized));
  const progressPercent = (activeIndex / (STAGES.length - 1)) * 100;

  useEffect(() => {
    const animations: ReturnType<typeof animate>[] = [];

    if (lineRef.current) {
      animations.push(animate(lineRef.current, {
        width: `${progressPercent}%`,
        ease: 'outQuad',
        duration: 600,
      }));
    }

    if (activeDotRef.current) {
      animations.push(animate(activeDotRef.current, {
        scale: [0.8, 1.25, 1],
        opacity: [0.7, 1],
        ease: 'inOutBack',
        duration: 500,
      }));
    }

    return () => animations.forEach((animation) => animation.cancel());
  }, [progressPercent, currentState]);

  return (
    <div className={`w-full py-3 ${className}`}>
      {/* Track bar container */}
      <div className="relative flex items-center justify-between">
        {/* Background track line */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 bg-[#2C3834] rounded-full z-0" />

        {/* Animated active progress line fill */}
        <div
          ref={lineRef}
          style={{ width: `${progressPercent}%` }}
          className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-[#5FE3B0] rounded-full z-0 transition-all"
        />

        {/* Stations */}
        {STAGES.map((stage, idx) => {
          const isDone = idx < activeIndex;
          const isCurrent = idx === activeIndex;

          return (
            <div key={stage.key} className="relative z-10 flex flex-col items-center">
              <div
                ref={isCurrent ? activeDotRef : null}
                className={`w-4 h-4 md:w-5 md:h-5 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${
                  isCurrent
                    ? 'bg-[#5FE3B0] border-white shadow-[0_0_12px_#5FE3B0]'
                    : isDone
                    ? 'bg-[#2F7D5B] border-[#5FE3B0]'
                    : 'bg-[#18211F] border-[#3A4843]'
                }`}
              >
                {isDone && (
                  <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-[#18211F]" />}
              </div>

              <span
                className={`text-[10px] md:text-xs mt-1.5 font-semibold transition-colors hidden sm:block ${
                  isCurrent
                    ? 'text-[#5FE3B0] font-bold'
                    : isDone
                    ? 'text-[#D9DED8]'
                    : 'text-[#5A6661]'
                }`}
              >
                {stage.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Mobile-only current step label */}
      <div className="sm:hidden text-center mt-2">
        <span className="text-xs text-[#5FE3B0] font-bold capitalize">
          Current: {currentNormalized.replace(/_/g, ' ')}
        </span>
      </div>
    </div>
  );
}
