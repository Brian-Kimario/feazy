/**
 * Visible brand copy in one place, so the founder's final wording is a one-line change.
 * Technical identifiers (cookie names, storage keys, SMS sender ID, template names, DB objects)
 * keep their legacy spelling on purpose; see docs/FOUNDER_FEEDBACK_IMPLEMENTATION.md.
 */
export const BRAND = {
  name: 'Feazy',
  domain: 'feazy.in',
} as const;

/** Candidate wording, pending founder approval. */
export const TAGLINES = {
  homeHeadline: 'Home repairs,',
  homeHeadlineEmphasis: 'made easy.',
  homeSub:
    'Verified professionals, itemised quotes in rupees, and no extra work without your approval.',
  customerSignIn: 'Your home, in good hands.',
  customerSignInSub: 'Pick up your bookings, quotes and property record.',
  professionalSignIn: 'Your skills. More opportunities.',
  professionalSignInSub: 'Open your job requests, quotes and earnings.',
  professionalOnboarding: 'Connect with customers who need your expertise.',
} as const;

/**
 * Whether the public site may promise a free inspection. Off until the founder confirms which
 * services qualify and who bears the cost: the live catalogue charges inspection fees of
 * roughly ₹349–₹800 and `create_booking` bills them. Turning this on only changes copy; making
 * inspections actually free is a separate pricing decision (see the progress doc).
 */
export const FREE_INSPECTION_PROMISED = process.env.NEXT_PUBLIC_FREE_INSPECTION === 'true';

export const inspectionLabel = (verb: 'Book' | 'Get') =>
  `${verb} ${FREE_INSPECTION_PROMISED ? 'a free inspection' : 'an inspection'}`;
