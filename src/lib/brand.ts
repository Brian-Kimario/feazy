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
  homeHeadline: 'Where Better Living Begins.',
  homeSub:
    'Experience refined home services, trusted expertise, and effortless convenience — thoughtfully brought together.',
  customerSignIn: 'Exceptional Care, Right at Your Doorstep.',
  customerSignInSub: 'Discover trusted professionals and experience a higher standard of home care.',
  customerPrimaryAction: 'Get Started',
  professionalSignIn: 'Where Expertise Finds Opportunity.',
  professionalSignInSub:
    'Bring your skills to the forefront, build your reputation, and grow with a platform that values professional excellence.',
  professionalPrimaryAction: 'Join as a Professional',
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
