/**
 * FAQ Database for Feazy Help System
 * Organized by category for easy maintenance and searchability
 */

export interface FAQItem {
  id: string;
  category: 'getting-started' | 'customer' | 'professional' | 'payments' | 'account' | 'troubleshooting';
  question: string;
  answer: string;
  tags: string[];
  relatedItems?: string[];
}

export const FAQ_ITEMS: FAQItem[] = [
  // ============= GETTING STARTED =============
  {
    id: 'gs-01',
    category: 'getting-started',
    question: 'How does Feazy work?',
    answer: 'Feazy connects property owners with verified professionals for maintenance and repairs. Simply describe your problem using text, photos, or video. Our system helps classify the issue and matches you with qualified professionals in your area. You\'ll see real-time tracking, get quotes for additional work, and maintain a complete service history for your property.',
    tags: ['overview', 'process', 'how-it-works'],
  },
  {
    id: 'gs-02',
    category: 'getting-started',
    question: 'How do I describe my problem?',
    answer: 'Start with what you see, not what you think it might be. Text works great—just explain where the problem is and what\'s happening. Add photos or video if possible; they really help professionals understand the issue faster. You don\'t need to know the trade or technical terms. Just describe it in plain language.',
    tags: ['intake', 'problem-description', 'photos'],
  },
  {
    id: 'gs-03',
    category: 'getting-started',
    question: 'What services are available?',
    answer: 'Feazy covers four main service areas: Plumbing (leaks, pressure, drainage, fixtures), Electrical (sockets, circuits, lighting, faults), Heating & Cooling (comfort systems, servicing, diagnosis), and General Maintenance (jobs that keep a property working well). If you\'re not sure which service fits your problem, start with a problem description and our system will help narrow it down.',
    tags: ['services', 'categories', 'service-areas'],
  },
  {
    id: 'gs-04',
    category: 'getting-started',
    question: 'Do I need to be technical to use Feazy?',
    answer: 'No. Feazy is designed for property owners who just want their problem fixed, not for people who already know the trade. You don\'t need to diagnose the issue or name the service. Just tell us what\'s happening and where. A qualified professional will inspect and confirm what needs to be done.',
    tags: ['beginner', 'non-technical', 'ease-of-use'],
  },

  // ============= CUSTOMER =============
  {
    id: 'cust-01',
    category: 'customer',
    question: 'How do I track my job?',
    answer: 'Once a professional is assigned, you\'ll see real-time status updates: professional assigned, on the way, arrived, inspection in progress, awaiting your approval for additional work, work in progress, and completed. Your job dashboard shows the professional\'s name, rating, and contact info. You can see the property address, scheduled time, and current status at all times.',
    tags: ['tracking', 'job-status', 'real-time'],
  },
  {
    id: 'cust-02',
    category: 'customer',
    question: 'What is a quote approval?',
    answer: 'During inspection, a professional might find additional work beyond what you originally described. They submit a quote—a detailed breakdown of what extra work is needed, the cost, and timeline. You review this in your dashboard and can approve or decline it. The professional doesn\'t proceed with extra work without your approval. This keeps costs transparent.',
    tags: ['quotes', 'approval', 'additional-work', 'transparency'],
  },
  {
    id: 'cust-03',
    category: 'customer',
    question: 'Can I request the same professional again?',
    answer: 'Yes. If you\'re happy with a professional and they\'re available, you can request them for future work. Feazy will try to match you, but availability can\'t be guaranteed. The system maintains a record of professionals you\'ve worked with before, making it easy to rebook.',
    tags: ['professionals', 'rebooking', 'preferences'],
  },
  {
    id: 'cust-04',
    category: 'customer',
    question: 'What if I\'m not satisfied with the work?',
    answer: 'Quality is important. If you\'re not satisfied, contact support with details and a reference to the job. We\'ll investigate and work toward a fair resolution. Every completed job includes a workmanship warranty. If something fails within the warranty period, reach out and we\'ll coordinate a follow-up.',
    tags: ['quality', 'complaints', 'warranty', 'satisfaction'],
  },
  {
    id: 'cust-05',
    category: 'customer',
    question: 'How is pricing determined?',
    answer: 'Pricing depends on the service type: some are fixed-price, others include an inspection fee (you pay if you decline the job), and some are quoted after inspection. You\'ll always know the pricing model before booking. Additional work is quoted separately and requires your approval before proceeding.',
    tags: ['pricing', 'quotes', 'costs', 'transparency'],
  },
  {
    id: 'cust-06',
    category: 'customer',
    question: 'What payment methods do you accept?',
    answer: 'Feazy accepts all major credit and debit cards. Payment is processed securely through our payment provider. You\'ll be invoiced after work is completed. For large jobs with quotes, you may have the option to pay a deposit upon approval, with final payment after completion.',
    tags: ['payments', 'cards', 'invoicing', 'security'],
  },
  {
    id: 'cust-07',
    category: 'customer',
    question: 'Do you keep a record of my property maintenance?',
    answer: 'Yes. Every completed service is recorded and attached to your property. You can see a timeline of all maintenance: what was done, who did it, when it was completed, the cost, and warranty information. This record is useful for future maintenance planning and improves your property\'s resale narrative.',
    tags: ['records', 'history', 'maintenance', 'property'],
  },

  // ============= PROFESSIONAL =============
  {
    id: 'prof-01',
    category: 'professional',
    question: 'How do I become a professional on Feazy?',
    answer: 'Visit the "Become a professional" page and start the onboarding. You\'ll provide your basic info, skills, certifications, and verification documents (identity, public liability insurance, background check). Once verified, you\'ll have access to incoming service requests in your area and skills.',
    tags: ['onboarding', 'registration', 'verification'],
  },
  {
    id: 'prof-02',
    category: 'professional',
    question: 'What verification is required?',
    answer: 'Before accepting live jobs, professionals must complete verification: identity verification, public liability insurance certificate, and a background check (Enhanced DBS or equivalent). This ensures customers feel safe and builds trust in the platform. Verification typically takes 2-5 business days.',
    tags: ['verification', 'documents', 'insurance', 'trust'],
  },
  {
    id: 'prof-03',
    category: 'professional',
    question: 'How do I set my availability?',
    answer: 'In your professional profile, set your working hours, days off, and service areas. This helps the system match you with jobs that fit your schedule and location. You can update your availability anytime, and you always have control over accepting or declining incoming requests.',
    tags: ['availability', 'schedule', 'service-areas'],
  },
  {
    id: 'prof-04',
    category: 'professional',
    question: 'How do I accept and complete a job?',
    answer: 'You\'ll receive incoming service requests that match your skills and availability. Review the problem description, customer, property, and timing. Accept or decline. Once accepted, you\'ll coordinate with the customer, perform the inspection, and submit your findings. Create a quote for any additional work, then execute the job and submit completion evidence.',
    tags: ['job-workflow', 'acceptance', 'completion'],
  },
  {
    id: 'prof-05',
    category: 'professional',
    question: 'What information do I get about a job?',
    answer: 'You receive: the customer\'s problem description, available photos or video, the property address and details, the scheduled time, and the customer\'s contact info. You can message the customer and request clarification. This is enough context to do the job properly without requiring extra diagnostic calls.',
    tags: ['job-context', 'information', 'clarity'],
  },
  {
    id: 'prof-06',
    category: 'professional',
    question: 'How do I get paid?',
    answer: 'Payments are settled weekly by default. After a job is completed and invoiced, funds are transferred to your registered bank account. You can view your earnings dashboard anytime to see completed jobs, pending invoices, and settlement schedule.',
    tags: ['payments', 'earnings', 'settlement', 'payout'],
  },
  {
    id: 'prof-07',
    category: 'professional',
    question: 'Can I see my rating and reviews?',
    answer: 'Yes. Customers rate their experience and leave reviews after job completion. Your profile displays your average rating and recent reviews. High ratings help you attract more requests. Ratings are transparent and fair—focused on professionalism and work quality.',
    tags: ['ratings', 'reviews', 'reputation'],
  },

  // ============= PAYMENTS =============
  {
    id: 'pay-01',
    category: 'payments',
    question: 'When am I charged?',
    answer: 'You\'re charged after work is completed and invoiced. For fixed-price jobs, this is automatic. For inspection-fee jobs, you\'re charged for the inspection even if you decline additional work. For quote-based jobs, you approve the quote before the professional proceeds, then pay after completion.',
    tags: ['invoicing', 'timing', 'charges'],
  },
  {
    id: 'pay-02',
    category: 'payments',
    question: 'What if there\'s a problem with my invoice?',
    answer: 'Contact support with your job reference and explain the issue. We\'ll review the invoice, work details, and approved quotes. If there\'s an error or dispute, we\'ll investigate and work toward fair resolution. Always save your job reference for easy lookup.',
    tags: ['disputes', 'invoicing', 'errors', 'support'],
  },
  {
    id: 'pay-03',
    category: 'payments',
    question: 'Can I get a refund?',
    answer: 'Refunds are handled case-by-case. If work is incomplete, unsatisfactory, or doesn\'t match the approved quote, contact support immediately. We\'ll investigate and determine appropriate resolution, which may include a refund, redo, or partial charge.',
    tags: ['refunds', 'resolution', 'satisfaction'],
  },

  // ============= ACCOUNT =============
  {
    id: 'acc-01',
    category: 'account',
    question: 'How do I update my profile?',
    answer: 'Log in to your dashboard and navigate to Profile. You can update your name, email, phone, address, and notification preferences. For professional accounts, you can also update skills, availability, and service areas. Changes take effect immediately.',
    tags: ['profile', 'settings', 'updates'],
  },
  {
    id: 'acc-02',
    category: 'account',
    question: 'How do I change my password?',
    answer: 'Go to Account Settings > Security. Click "Change password" and follow the steps. You\'ll need your current password and then enter your new password twice. For security, use a strong, unique password.',
    tags: ['security', 'password', 'account'],
  },
  {
    id: 'acc-03',
    category: 'account',
    question: 'What if I forgot my password?',
    answer: 'Click "Forgot password" on the login page. Enter your email and we\'ll send a reset link. Click the link and choose a new password. If you don\'t see the email, check spam and make sure you\'re using the email associated with your Feazy account.',
    tags: ['password', 'reset', 'email'],
  },
  {
    id: 'acc-04',
    category: 'account',
    question: 'Can I delete my account?',
    answer: 'Yes. Go to Account Settings > Dangerous Zone and click "Delete account". This will permanently remove your profile and all associated data. You\'ll need to confirm this action. This cannot be undone, so be certain before proceeding.',
    tags: ['deletion', 'privacy', 'data'],
  },
  {
    id: 'acc-05',
    category: 'account',
    question: 'How do I manage notification preferences?',
    answer: 'In Settings > Notifications, choose which updates you want to receive: email, SMS, or push notifications. You can customize preferences by type (job updates, quotes, payments, etc.). You\'ll always receive critical notifications (e.g., new job offer for professionals).',
    tags: ['notifications', 'preferences', 'communication'],
  },

  // ============= TROUBLESHOOTING =============
  {
    id: 'ts-01',
    category: 'troubleshooting',
    question: 'Why can\'t I see available professionals?',
    answer: 'This usually means: no qualified professionals are available in your area, your service area isn\'t covered yet, or available professionals are fully booked. Try adjusting your preferred time window or contact support for an update on service expansion.',
    tags: ['professionals', 'availability', 'matching'],
  },
  {
    id: 'ts-02',
    category: 'troubleshooting',
    question: 'Why is my job not assigned?',
    answer: 'Jobs may be pending if: no professionals match your criteria yet, all matching professionals are unavailable, or the system is still searching. Usually assignment happens within a few hours. If it\'s been longer, contact support to check status.',
    tags: ['jobs', 'assignment', 'delays'],
  },
  {
    id: 'ts-03',
    category: 'troubleshooting',
    question: 'The page isn\'t loading properly.',
    answer: 'Try: refreshing the page, clearing your browser cache, or using a different browser. If you\'re on mobile, check that you have a stable internet connection. For persistent issues, contact support with details of what you\'re seeing.',
    tags: ['technical', 'loading', 'browser'],
  },
  {
    id: 'ts-04',
    category: 'troubleshooting',
    question: 'I didn\'t receive a notification about my job.',
    answer: 'Check your notification settings in Account > Notifications. Make sure email/SMS/push notifications are enabled. Check your spam folder if it\'s email. For urgent updates, log in to your dashboard and check your job status directly.',
    tags: ['notifications', 'email', 'delivery'],
  },
  {
    id: 'ts-05',
    category: 'troubleshooting',
    question: 'My payment failed. What do I do?',
    answer: 'Check that your card details are current and have sufficient funds. Try a different card if available. If payment continues to fail, contact support with your job reference and payment error details. We can arrange alternative payment methods.',
    tags: ['payments', 'errors', 'failure'],
  },
  {
    id: 'ts-06',
    category: 'troubleshooting',
    question: 'I think there\'s a bug. How do I report it?',
    answer: 'Contact support with as much detail as possible: what you were trying to do, what happened instead, what device/browser you\'re using, and screenshots if helpful. Include your account email. We take bug reports seriously and will investigate promptly.',
    tags: ['bugs', 'technical', 'support'],
  },
  {
    id: 'ts-07',
    category: 'troubleshooting',
    question: 'Why am I locked out of my account?',
    answer: 'This usually happens after multiple failed login attempts (security measure). Wait 15-30 minutes and try again. If you\'re still locked out, click "Forgot password" to reset your password. If you can\'t access your email, contact support.',
    tags: ['security', 'lockout', 'access'],
  },
];

export function getFAQByCategory(category: FAQItem['category']): FAQItem[] {
  return FAQ_ITEMS.filter((item) => item.category === category);
}

export function searchFAQ(query: string): FAQItem[] {
  const lowerQuery = query.toLowerCase();
  return FAQ_ITEMS.filter((item) => {
    const questionMatch = item.question.toLowerCase().includes(lowerQuery);
    const answerMatch = item.answer.toLowerCase().includes(lowerQuery);
    const tagsMatch = item.tags.some((tag) => tag.includes(lowerQuery));
    return questionMatch || answerMatch || tagsMatch;
  });
}

export const FAQ_CATEGORIES = {
  'getting-started': { label: 'Getting Started', icon: '🚀', color: 'teal' },
  'customer': { label: 'For Customers', icon: '👤', color: 'blue' },
  'professional': { label: 'For Professionals', icon: '🔧', color: 'success' },
  'payments': { label: 'Payments & Billing', icon: '💰', color: 'info' },
  'account': { label: 'Account & Security', icon: '🔐', color: 'warning' },
  'troubleshooting': { label: 'Troubleshooting', icon: '⚙️', color: 'danger' },
} as const;
