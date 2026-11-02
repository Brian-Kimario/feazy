'use client';

import Link from 'next/link';
import { useState } from 'react';
import { CheckCircle2, ArrowLeft } from 'lucide-react';
import { SupportForm } from '@/components/shared/SupportForm';
import { Button } from '@/components/ui/Button';

export function DemoContactPageClient() {
  const [referenceNumber, setReferenceNumber] = useState<string | null>(null);

  const handleSuccess = (refNum: string) => {
    setReferenceNumber(refNum);
  };

  const handleNewRequest = () => {
    setReferenceNumber(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="bg-gradient-to-b from-primary/5 via-primary/2 to-background border-b border-border">
        <div className="container max-w-4xl mx-auto px-4 py-12 sm:py-16">
          <h1 className="text-3xl sm:text-4xl font-bold mb-3">Request a Demo</h1>
          <p className="text-muted-foreground text-lg">
            See Feazy in action. Submit your demo request and our team will get back to you as soon as possible.
          </p>
        </div>
      </div>

      <div className="container max-w-2xl mx-auto px-4 py-12">
        {referenceNumber ? (
          /* Success State */
          <div className="space-y-8">
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="bg-primary/10 rounded-full p-6">
                  <CheckCircle2 className="w-12 h-12 text-primary" />
                </div>
              </div>
              <h2 className="text-2xl font-bold">Thank You!</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Your demo request has been submitted successfully. We will review it and respond as soon as possible.
              </p>
            </div>

            {/* Reference Number Card */}
            <div className="bg-muted/50 border border-border rounded-lg p-6">
              <p className="text-sm text-muted-foreground mb-2">Reference Number</p>
              <div className="flex items-center justify-between gap-4">
                <p className="font-mono text-lg font-bold text-primary">{referenceNumber}</p>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(referenceNumber);
                  }}
                  className="text-sm text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>

            {/* Next Steps */}
            <div className="space-y-4">
              <h3 className="font-bold">What happens next?</h3>
              <ul className="space-y-3">
                <li className="flex gap-3">
                  <span className="font-bold text-primary text-sm min-w-6">1</span>
                  <span className="text-sm text-muted-foreground">
                    We have received your request and assigned it a reference number.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold text-primary text-sm min-w-6">2</span>
                  <span className="text-sm text-muted-foreground">
                    Our team will review your demo request and respond via email within the expected timeframe.
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="font-bold text-primary text-sm min-w-6">3</span>
                  <span className="text-sm text-muted-foreground">
                    Keep your reference number handy for follow-up communications.
                  </span>
                </li>
              </ul>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-6">
              <Button variant="secondary" className="flex-1" onClick={handleNewRequest}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Submit Another Request
              </Button>
              <Link href="/help" className="flex-1">
                <Button variant="outline" className="w-full">
                  Learn More
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          /* Form State */
          <div className="bg-card border border-border rounded-lg p-6 sm:p-8">
            <SupportForm onSuccess={handleSuccess} />
          </div>
        )}
      </div>
    </div>
  );
}
