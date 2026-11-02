import { getCurrentProfile } from '@/lib/auth';
import { Card, Button } from '@/components/ui';
import Link from 'next/link';

export const metadata = {
  title: 'Professional Setup - Feazy',
};

export default async function ProfessionalOnboardingPage() {
  const profile = await getCurrentProfile();

  const checklistItems = [
    {
      id: 1,
      title: 'Complete Your Profile',
      description: 'Add your professional photo, bio, and experience',
      completed: !!profile?.full_name,
      link: '/professional/profile/edit',
    },
    {
      id: 2,
      title: 'Add Your Skills',
      description: 'List the services and expertise you offer',
      completed: false,
      link: '/professional/profile/edit',
    },
    {
      id: 3,
      title: 'Set Your Rates',
      description: 'Configure your hourly rates or pricing structure',
      completed: false,
      link: '/professional/profile/edit',
    },
    {
      id: 4,
      title: 'Verify Your Identity',
      description: 'Complete identity and background verification',
      completed: false,
      link: '#',
    },
    {
      id: 5,
      title: 'Set Up Payment Method',
      description: 'Add a bank account for payouts',
      completed: false,
      link: '#',
    },
    {
      id: 6,
      title: 'Review Terms & Policies',
      description: 'Understand our terms of service and policies',
      completed: false,
      link: '#',
    },
  ];

  const completedCount = checklistItems.filter((item) => item.completed).length;
  const progressPercent = (completedCount / checklistItems.length) * 100;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="font-display font-bold text-4xl text-ink mb-2">
            Get Your Profile Ready
          </h1>
          <p className="text-ink-3 text-lg">
            Complete these steps to start bidding on jobs and earning
          </p>
        </div>

        {/* Progress Card */}
        <Card>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="font-display font-bold text-lg text-ink">Setup Progress</h2>
              <span className="font-display font-bold text-lg text-teal">
                {completedCount} / {checklistItems.length}
              </span>
            </div>
            <div className="w-full bg-line/10 rounded-full h-3 overflow-hidden">
              <div
                className="bg-teal h-3 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
            <p className="text-ink-3 text-sm">
              {progressPercent === 100
                ? '🎉 You\'re all set! Start browsing jobs.'
                : `Complete ${checklistItems.length - completedCount} more step${checklistItems.length - completedCount !== 1 ? 's' : ''} to get started`}
            </p>
          </div>
        </Card>

        {/* Checklist */}
        <div className="space-y-3">
          {checklistItems.map((item) => (
            <Card key={item.id} className={item.completed ? 'bg-teal-wash border-teal/20' : ''}>
              <Link href={item.link} className="block">
                <div className="flex items-start gap-4 p-2 hover:bg-paper-2 rounded-lg transition-colors">
                  {/* Checkbox */}
                  <div className="flex-shrink-0 mt-1">
                    {item.completed ? (
                      <div className="w-6 h-6 rounded-full bg-teal flex items-center justify-center">
                        <span className="text-paper text-lg">✓</span>
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full border-2 border-line"></div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3
                        className={`font-display font-bold text-lg ${
                          item.completed ? 'text-ink-3 line-through' : 'text-ink'
                        }`}
                      >
                        {item.title}
                      </h3>
                      {item.completed && (
                        <span className="text-xs px-2 py-1 bg-teal-soft text-teal rounded">
                          Done
                        </span>
                      )}
                    </div>
                    <p className={item.completed ? 'text-ink-3/60' : 'text-ink-3'}>
                      {item.description}
                    </p>
                  </div>

                  {/* Arrow */}
                  {!item.completed && (
                    <div className="flex-shrink-0 text-ink-3 group-hover:text-teal transition-colors mt-1">
                      →
                    </div>
                  )}
                </div>
              </Link>
            </Card>
          ))}
        </div>

        {/* Next Steps */}
        {progressPercent === 100 && (
          <Card className="bg-teal-soft border-teal/30">
            <div className="space-y-4">
              <h2 className="font-display font-bold text-xl text-ink">Ready to Start!</h2>
              <p className="text-ink-3">
                Your profile is complete and verified. You can now browse jobs and start submitting bids.
              </p>
              <Link href="/professional/jobs">
                <Button variant="primary" size="lg" className="w-full">
                  Browse Available Jobs
                </Button>
              </Link>
            </div>
          </Card>
        )}

        {/* Help Section */}
        <Card className="bg-paper">
          <div className="space-y-3">
            <h3 className="font-display font-bold text-lg text-ink">Need Help?</h3>
            <p className="text-ink-3 text-sm">
              Check out our guides on how to create an effective profile and win more bids.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm">
                View Guides
              </Button>
              <Button variant="secondary" size="sm">
                Contact Support
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
