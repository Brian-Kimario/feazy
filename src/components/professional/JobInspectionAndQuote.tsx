'use client';

import { useState, useTransition } from 'react';
import { submitInspectionAction, createQuoteAction } from '@/app/professional/actions';
import { useRouter } from 'next/navigation';

interface LineItem {
  id: string;
  itemType: 'labour' | 'material' | 'fee';
  description: string;
  quantity: number;
  unitPrice: number;
}

interface JobInspectionAndQuoteProps {
  jobId: string;
  currentState: string;
}

export function JobInspectionAndQuote({ jobId, currentState }: JobInspectionAndQuoteProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Tab: 'inspection' | 'quote'
  const [activeTab, setActiveTab] = useState<'inspection' | 'quote'>('inspection');

  // Inspection form state
  const [findings, setFindings] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [inspectionSuccess, setInspectionSuccess] = useState(false);

  // Quote form state
  const [quoteReason, setQuoteReason] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { id: '1', itemType: 'material', description: '', quantity: 1, unitPrice: 0 },
  ]);
  const [quoteSuccess, setQuoteSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Quote math
  const subtotal = lineItems.reduce((acc, item) => acc + (item.quantity * item.unitPrice), 0);
  // No fee is added on top of line items; none is configured.
  const estimatedTotal = Number(subtotal.toFixed(2));

  function addLineItem() {
    setLineItems((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        itemType: 'material',
        description: '',
        quantity: 1,
        unitPrice: 0,
      },
    ]);
  }

  function updateLineItem(id: string, field: keyof LineItem, val: string | number) {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
  }

  function removeLineItem(id: string) {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  }

  function handleInspectionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!findings.trim()) {
      setErrorMessage('Please describe your on-site findings.');
      return;
    }
    setErrorMessage(null);

    startTransition(async () => {
      const res = await submitInspectionAction({
        jobId,
        findings,
        recommendation,
      });

      if (res.success === false) {
        setErrorMessage(res.error || 'Failed to submit inspection');
      } else {
        setInspectionSuccess(true);
        router.refresh();
      }
    });
  }

  function handleQuoteSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!quoteReason.trim()) {
      setErrorMessage('Please state the authorization reason for this additional quote.');
      return;
    }
    const invalidItem = lineItems.find((i) => !i.description.trim() || i.unitPrice <= 0);
    if (invalidItem) {
      setErrorMessage('All line items must have a description and price greater than 0.');
      return;
    }
    setErrorMessage(null);

    startTransition(async () => {
      const res = await createQuoteAction({
        jobId,
        reason: quoteReason,
        lineItems: lineItems.map((i) => ({
          itemType: i.itemType,
          description: i.description,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
        })),
      });

      if (res.success === false) {
        setErrorMessage(res.error || 'Failed to create quote');
      } else {
        setQuoteSuccess(true);
        router.refresh();
      }
    });
  }

  // Only show when the job is arrived or in_progress or quote_pending
  const isRelevant = ['arrived', 'assessing', 'in_progress', 'quote_pending'].includes(currentState);
  if (!isRelevant) return null;

  return (
    <div className="bg-[#FFFEFA] border border-[#D9DED8] rounded-xl overflow-hidden mt-6">
      <div className="border-b border-[#D9DED8] px-5 py-4 bg-[#F7F4EC] flex items-center justify-between">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-[0.11em] text-[#7C8681]">On-Site Workspace</span>
          <h3 className="text-base font-bold text-[#18211F]">Inspection & Quote Authorizations</h3>
        </div>

        {/* Tab switch */}
        <div className="flex bg-[#E8EBE7] p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('inspection')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              activeTab === 'inspection' ? 'bg-white text-[#18211F] shadow-sm' : 'text-[#5A6661]'
            }`}
          >
            Findings
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('quote')}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
              activeTab === 'quote' ? 'bg-white text-[#18211F] shadow-sm' : 'text-[#5A6661]'
            }`}
          >
            Quote Builder
          </button>
        </div>
      </div>

      <div className="p-5 md:p-6">
        {errorMessage && (
          <div className="mb-4 p-3 bg-[#F5E6E6] border border-[#DFC0C0] text-[#9B3535] text-xs font-medium rounded-lg">
            {errorMessage}
          </div>
        )}

        {/* ── Inspection Tab ── */}
        {activeTab === 'inspection' && (
          <div>
            {inspectionSuccess ? (
              <div className="p-4 bg-[#E2EEE9] border border-[#C8DDD5] rounded-lg text-xs text-[#176B5B] font-medium flex items-center gap-2">
                <span>✓ On-site findings recorded in immutable audit log.</span>
              </div>
            ) : (
              <form onSubmit={handleInspectionSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#18211F] mb-1.5 uppercase tracking-wider">
                    Diagnostic Findings *
                  </label>
                  <textarea
                    rows={3}
                    value={findings}
                    onChange={(e) => setFindings(e.target.value)}
                    placeholder="Describe what you observed upon physical inspection (e.g., corroded pipe threads, valve seal cracked, requires shut-off)..."
                    className="w-full text-xs p-3 bg-white border border-[#D9DED8] rounded-lg outline-none focus:border-[#176B5B] text-[#18211F]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#18211F] mb-1.5 uppercase tracking-wider">
                    Recommended Fix
                  </label>
                  <input
                    type="text"
                    value={recommendation}
                    onChange={(e) => setRecommendation(e.target.value)}
                    placeholder="e.g. Replace quarter-turn shut-off valve and re-thread brass nipple"
                    className="w-full text-xs p-3 bg-white border border-[#D9DED8] rounded-lg outline-none focus:border-[#176B5B] text-[#18211F]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isPending}
                  className="w-full sm:w-auto min-h-[48px] px-6 py-3 bg-[#176B5B] text-white text-sm font-bold rounded-xl hover:bg-[#0D5144] transition disabled:opacity-50 flex items-center justify-center shadow-sm"
                >
                  {isPending ? 'Recording…' : 'Record Inspection Findings'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* ── Quote Builder Tab ── */}
        {activeTab === 'quote' && (
          <div>
            {quoteSuccess || currentState === 'quote_pending' ? (
              <div className="p-4 bg-[#FFF4E0] border border-[#E8D5A3] rounded-lg text-xs text-[#9B6700] font-medium">
                ⏳ Quote is currently pending customer approval. The customer has received an immediate notification on their dashboard.
              </div>
            ) : (
              <form onSubmit={handleQuoteSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-[#18211F] mb-1.5 uppercase tracking-wider">
                    {currentState === 'assessing' ? 'Repair Scope & Reason *' : 'Scope & Reason for Extra Work *'}
                  </label>
                  <input
                    type="text"
                    value={quoteReason}
                    onChange={(e) => setQuoteReason(e.target.value)}
                    placeholder="e.g. Discovered rusted secondary riser valve requiring replacement"
                    className="w-full text-xs p-3 bg-white border border-[#D9DED8] rounded-lg outline-none focus:border-[#176B5B] text-[#18211F]"
                  />
                </div>

                {/* Line Items */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#7C8681]">Line Items</span>
                    <button
                      type="button"
                      onClick={addLineItem}
                      className="text-xs text-[#176B5B] font-semibold hover:underline"
                    >
                      + Add Item
                    </button>
                  </div>

                  {lineItems.map((item, index) => (
                    <div key={item.id} className="flex flex-col sm:flex-row items-center gap-2 p-2.5 bg-[#F9FAF8] border border-[#D9DED8] rounded-lg">
                      <select
                        value={item.itemType}
                        onChange={(e) => updateLineItem(item.id, 'itemType', e.target.value as any)}
                        className="text-xs bg-white border border-[#D9DED8] rounded p-1.5 text-[#18211F]"
                      >
                        <option value="material">Part/Material</option>
                        <option value="labour">Labour</option>
                        <option value="fee">Service Fee</option>
                      </select>

                      <input
                        type="text"
                        placeholder="Description"
                        value={item.description}
                        onChange={(e) => updateLineItem(item.id, 'description', e.target.value)}
                        className="flex-1 text-xs bg-white border border-[#D9DED8] rounded p-1.5 text-[#18211F] min-w-0"
                      />

                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-[#7C8681]">Qty:</span>
                          <input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateLineItem(item.id, 'quantity', Number(e.target.value))}
                            className="w-14 text-xs bg-white border border-[#D9DED8] rounded p-1.5 text-center text-[#18211F]"
                          />
                        </div>

                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-[#7C8681]">₹:</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={(e) => updateLineItem(item.id, 'unitPrice', Number(e.target.value))}
                            className="w-20 text-xs bg-white border border-[#D9DED8] rounded p-1.5 text-right text-[#18211F]"
                          />
                        </div>

                        {lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLineItem(item.id)}
                            className="text-[#9B3535] hover:text-[#DC2626] text-sm p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-[#FCE8E8] transition"
                            title="Remove item"
                            aria-label="Remove item"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Subtotal & Total Preview */}
                <div className="p-3 bg-[#F7F4EC] rounded-lg text-xs space-y-1 text-[#5A6661]">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-semibold text-[#18211F]">₹{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-[#D9DED8] font-bold text-[#18211F]">
                    <span>Total Authorization Requested:</span>
                    <span className="text-[#176B5B]">₹{estimatedTotal.toFixed(2)}</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPending || subtotal <= 0}
                  className="w-full min-h-[48px] px-5 py-3 bg-[#176B5B] text-white text-sm font-bold rounded-xl hover:bg-[#0D5144] transition disabled:opacity-50 flex items-center justify-center shadow-sm"
                >
                  {isPending ? 'Submitting to Customer…' : `Send Quote for Customer Approval (₹${estimatedTotal.toFixed(2)})`}
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
