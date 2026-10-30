import { describe, expect, it } from 'vitest';
import { HELP_CATEGORIES, HELP_FAQS, filterFaqs } from './content';

describe('help content', () => {
  it('has unique ids and every FAQ sits in a real category for its audience', () => {
    expect(new Set(HELP_FAQS.map((f) => f.id)).size).toBe(HELP_FAQS.length);
    for (const faq of HELP_FAQS) {
      expect(HELP_CATEGORIES[faq.audience].map((c) => c.id)).toContain(faq.category);
    }
  });
  it('only links to in-app paths', () => {
    for (const faq of HELP_FAQS) if (faq.action) expect(faq.action.href).toMatch(/^\/[a-z]/);
  });
});

describe('filterFaqs', () => {
  it('narrows by audience and category', () => {
    const list = filterFaqs(HELP_FAQS, { audience: 'customer', category: 'quotes-payment' });
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((f) => f.audience === 'customer' && f.category === 'quotes-payment')).toBe(true);
  });
  it('searches across categories and requires every word', () => {
    const hits = filterFaqs(HELP_FAQS, { audience: 'customer', category: 'booking', query: 'UPI pay' });
    expect(hits.map((f) => f.id)).toEqual(['c-pay']);
    expect(filterFaqs(HELP_FAQS, { audience: 'customer', query: 'zzzz' })).toEqual([]);
  });
});
