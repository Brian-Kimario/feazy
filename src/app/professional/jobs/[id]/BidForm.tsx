'use client';

import { useState } from 'react';
import { Card, Button, Input, Label, Textarea } from '@/components/ui';

interface BidFormProps {
  jobId: string;
  jobTitle: string;
  budget: number;
}

export function BidForm({ jobId, jobTitle, budget }: BidFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bidAmount, setBidAmount] = useState(budget);
  const [timeline, setTimeline] = useState('1 week');
  const [proposal, setProposal] = useState('');
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmitBid(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // TODO: Replace with actual API call to submit bid
      console.log({
        jobId,
        bidAmount,
        timeline,
        proposal,
      });

      // Simulate submission
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setSubmitted(true);
    } catch (error) {
      console.error('Error submitting bid:', error);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <Card className="sticky top-20 bg-teal-soft border-teal/30">
        <div className="text-center space-y-4">
          <div className="text-4xl">✓</div>
          <div>
            <h3 className="font-display font-bold text-ink mb-2">Bid Submitted!</h3>
            <p className="text-ink-3 text-sm">
              Your proposal has been sent to the customer. They will review and respond soon.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => setSubmitted(false)}
          >
            Submit Another Bid
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="sticky top-20">
      <form onSubmit={handleSubmitBid} className="space-y-4">
        <h3 className="font-display font-bold text-lg text-ink">Submit Your Bid</h3>

        {/* Bid Amount */}
        <div>
          <Label htmlFor="bid_amount">Your Bid Amount</Label>
          <div className="relative mt-2">
            <span className="absolute left-3 top-2 text-ink font-medium">$</span>
            <Input
              id="bid_amount"
              type="number"
              min="0"
              step="50"
              value={bidAmount}
              onChange={(e) => setBidAmount(Number(e.target.value))}
              className="pl-7"
              placeholder="0.00"
            />
          </div>
          <p className="text-ink-3 text-xs mt-1">
            Budget: ${budget} | {bidAmount > budget ? 'Above' : bidAmount < budget ? 'Below' : 'At'} budget
          </p>
        </div>

        {/* Timeline */}
        <div>
          <Label htmlFor="timeline">Estimated Timeline</Label>
          <select
            id="timeline"
            value={timeline}
            onChange={(e) => setTimeline(e.target.value)}
            className="w-full mt-2 px-3 py-2 bg-paper border border-line rounded-lg text-ink text-sm focus:outline-none focus:border-teal"
          >
            <option>1-2 days</option>
            <option>3-5 days</option>
            <option>1 week</option>
            <option>2 weeks</option>
            <option>Custom</option>
          </select>
        </div>

        {/* Proposal Message */}
        <div>
          <Label htmlFor="proposal">Your Proposal</Label>
          <Textarea
            id="proposal"
            value={proposal}
            onChange={(e) => setProposal(e.target.value)}
            placeholder="Explain your approach, experience with similar jobs, why you're a good fit for this work..."
            rows={5}
            className="mt-2"
          />
          <p className="text-ink-3 text-xs mt-1">
            {proposal.length} / 500 characters
          </p>
        </div>

        {/* Submit Button */}
        <Button
          type="submit"
          variant="primary"
          size="lg"
          disabled={isSubmitting || !proposal.trim() || bidAmount <= 0}
          className="w-full"
        >
          {isSubmitting ? 'Submitting...' : 'Submit Bid'}
        </Button>

        {/* Terms */}
        <p className="text-ink-3 text-xs text-center">
          By submitting, you agree to Feazy's terms of service
        </p>
      </form>
    </Card>
  );
}
