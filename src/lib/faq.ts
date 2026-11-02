export type FAQCategory = 'getting-started' | 'bookings' | 'payments' | 'professional' | 'account';

export interface FAQ {
  id: string;
  category: FAQCategory;
  question: string;
  answer: string;
}

export const faqs: FAQ[] = [
  // Getting Started
  {
    id: 'faq-1',
    category: 'getting-started',
    question: 'How do I get started with Feazy?',
    answer:
      'Getting started is simple. Sign up with your email or Google account, create your profile with your property information, and describe the problem you need help with. Our AI will help classify the issue and suggest available professionals.',
  },
  {
    id: 'faq-2',
    category: 'getting-started',
    question: 'What property information do I need to provide?',
    answer:
      'We ask for your property address, type (house, apartment, condo, etc.), and year built. This helps us match you with professionals who serve your area and understand your property type.',
  },
  {
    id: 'faq-3',
    category: 'getting-started',
    question: 'Can I manage multiple properties on Feazy?',
    answer:
      'Yes. You can add multiple properties to your account and manage them all in one place. When creating a service request, simply select which property needs the work.',
  },
  {
    id: 'faq-4',
    category: 'getting-started',
    question: 'How does the AI intake process work?',
    answer:
      'Describe your problem using text, photos, or video. Our AI analyzes your description and suggests the most relevant service category. A professional will review and confirm the diagnosis during their inspection.',
  },
  {
    id: 'faq-5',
    category: 'getting-started',
    question: 'Is Feazy available in my area?',
    answer:
      'Feazy is currently available in select cities. Enter your zip code on our homepage to check availability in your area. We are expanding regularly, so check back soon.',
  },

  // Bookings
  {
    id: 'faq-6',
    category: 'bookings',
    question: 'How do I book a professional?',
    answer:
      'After describing your problem, you will see available professionals and time slots. Select your preferred professional and time, then confirm the booking. The professional will receive your request and confirm availability.',
  },
  {
    id: 'faq-7',
    category: 'bookings',
    question: 'Can I request a specific professional?',
    answer:
      'Yes. If you have worked with a professional before and want to book them again, you can request them specifically. If they are available and verified, they may accept your request.',
  },
  {
    id: 'faq-8',
    category: 'bookings',
    question: 'What if a professional cancels my appointment?',
    answer:
      'If a professional cancels, we will notify you immediately and offer alternative options. You can rebook with another available professional or reschedule for a different time.',
  },
  {
    id: 'faq-9',
    category: 'bookings',
    question: 'Can I reschedule my booking?',
    answer:
      'Yes. You can reschedule your booking up to 24 hours before the appointment. Go to your booking details and select a new time slot. If your preferred professional is not available, we will suggest alternatives.',
  },
  {
    id: 'faq-10',
    category: 'bookings',
    question: 'What happens during the inspection visit?',
    answer:
      'The professional will arrive at the scheduled time, assess your property issue, take photos and notes, and provide a written quote for any recommended work. You will approve the quote before work begins.',
  },

  // Payments
  {
    id: 'faq-11',
    category: 'payments',
    question: 'How does pricing work?',
    answer:
      'Feazy uses a transparent pricing model. The inspection is included with your booking. For repairs, the professional provides a quote after the inspection. You review and approve before any paid work begins.',
  },
  {
    id: 'faq-12',
    category: 'payments',
    question: 'What payment methods do you accept?',
    answer:
      'We accept all major credit cards (Visa, Mastercard, American Express) and digital wallets. Payments are secure and processed through our trusted payment provider.',
  },
  {
    id: 'faq-13',
    category: 'payments',
    question: 'When do I pay?',
    answer:
      'For inspections, payment is processed after the professional completes the visit. If additional work is needed, you pay only after approving the quote and the work is completed.',
  },
  {
    id: 'faq-14',
    category: 'payments',
    question: 'Do you offer financing options?',
    answer:
      'For larger repairs, we may offer financing options at checkout. The availability depends on your approval and the invoice amount. Check our financing partners for current terms.',
  },
  {
    id: 'faq-15',
    category: 'payments',
    question: 'What is your refund policy?',
    answer:
      'If a professional does not show up or does not complete the agreed-upon work, you can request a refund. We investigate the claim and process refunds within 5-7 business days.',
  },
  {
    id: 'faq-16',
    category: 'payments',
    question: 'Do I get an invoice?',
    answer:
      'Yes. After work is completed, you receive a detailed invoice showing the services performed, materials used, and amounts paid. You can download it from your account anytime.',
  },

  // Professional
  {
    id: 'faq-17',
    category: 'professional',
    question: 'How are professionals verified on Feazy?',
    answer:
      'All professionals on Feazy undergo background checks, identity verification, and skill validation. We confirm licenses and insurance where required by local regulations.',
  },
  {
    id: 'faq-18',
    category: 'professional',
    question: 'Why is not a professional available in my area?',
    answer:
      'Professional availability depends on their location, service areas, and schedule. We are continuously onboarding new professionals. You can check back for updated availability.',
  },
  {
    id: 'faq-19',
    category: 'professional',
    question: 'Can I see professional reviews and ratings?',
    answer:
      'Yes. Each professional has a profile showing their ratings, reviews from past customers, skills, years of experience, and service areas. This helps you choose the right professional for your job.',
  },
  {
    id: 'faq-20',
    category: 'professional',
    question: 'How do I report a professional?',
    answer:
      'If you have concerns about a professional work or conduct, use the report function in the job details page. Our team will investigate and take appropriate action.',
  },

  // Account
  {
    id: 'faq-21',
    category: 'account',
    question: 'How do I reset my password?',
    answer:
      'On the login page, click "Forgot password?" and enter your email. We will send you a link to reset your password. The link expires after 24 hours for security.',
  },
  {
    id: 'faq-22',
    category: 'account',
    question: 'Can I change my email address?',
    answer:
      'Yes. Go to account settings and update your email address. We will send a verification link to your new email. You must verify it to complete the change.',
  },
  {
    id: 'faq-23',
    category: 'account',
    question: 'How do I delete my account?',
    answer:
      'You can delete your account from account settings. This action is permanent and will remove all your profile data and history. Download your data first if needed.',
  },
  {
    id: 'faq-24',
    category: 'account',
    question: 'Is my information secure?',
    answer:
      'Yes. We use industry-standard encryption and security practices to protect your personal and payment information. Your data is never shared with third parties without your consent.',
  },
  {
    id: 'faq-25',
    category: 'account',
    question: 'How do I view my job history?',
    answer:
      'Your complete service history is available in the "History" section of your account. You can filter by date, property, or service type. This helps track your property maintenance.',
  },
];

export const categoryLabels: Record<FAQCategory, string> = {
  'getting-started': 'Getting Started',
  bookings: 'Bookings',
  payments: 'Payments',
  professional: 'Professionals',
  account: 'Account',
};

export const getCategoryFAQs = (category: FAQCategory): FAQ[] => {
  return faqs.filter((faq) => faq.category === category);
};

export const searchFAQs = (query: string): FAQ[] => {
  const lowerQuery = query.toLowerCase();
  return faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(lowerQuery) ||
      faq.answer.toLowerCase().includes(lowerQuery),
  );
};
