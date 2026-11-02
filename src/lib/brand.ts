/**
 * Visible brand copy in one place, so the founder's final wording is a one-line change.
 * Technical identifiers (cookie names, storage keys, SMS sender ID, template names, DB objects)
 * keep their legacy spelling on purpose; see docs/FOUNDER_FEEDBACK_IMPLEMENTATION.md.
 */
export const BRAND = {
  name: 'Feazy',
  domain: 'feazy.in',
} as const;

/** Final wording chosen after review of the founder's tagline options; see docs/FOUNDER_FEEDBACK_IMPLEMENTATION.md. */
export const TAGLINES = {
  homeHeadline: 'Your home.',
  homeHeadlineEmphasis: 'Expert hands.',
  tagline: 'Home care, made effortless.',
  homeSub:
    'Home care, made effortless: skilled professionals, itemised quotes in rupees, and no extra work without your approval.',
  customerSignIn: 'Welcome to FEAZY.',
  customerSignInSub: 'Pick up your bookings, quotes and property record.',
  professionalSignIn: 'Where expertise meets opportunity.',
  professionalSignInSub: 'Open your job requests, quotes and earnings.',
  professionalOnboarding: 'Connect with customers who need your expertise.',
} as const;

/**
 * Whether the public site may promise a free inspection. The founder has decided inspections
 * are free; this stays off until migration 20261102_119 is applied to the live database,
 * because until then `create_booking` still bills the ₹349–₹800 inspection fee. Set
 * NEXT_PUBLIC_FREE_INSPECTION=true in the same release that applies the migration.
 */
export const FREE_INSPECTION_PROMISED = process.env.NEXT_PUBLIC_FREE_INSPECTION === 'true';

export const inspectionLabel = (verb: 'Book' | 'Get') =>
  `${verb} ${FREE_INSPECTION_PROMISED ? 'a free inspection' : 'an inspection'}`;
