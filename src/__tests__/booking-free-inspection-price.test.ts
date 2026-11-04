import { describe, expect, it } from 'vitest';
import { priceInfo, type WizardService } from '@/components/customer/BookingWizard';

const inspectionService: WizardService = {
  id: 'svc-1',
  name: 'Fault diagnosis',
  slug: 'fault-diagnosis',
  description: null,
  pricing_model: 'inspection',
  base_price: null,
  inspection_fee: 700,
  estimated_duration_minutes: 60,
  options: [],
};

describe('priceInfo for inspection-model services', () => {
  it('shows the visit fee while free inspection is off (matches create_booking before migration 119)', () => {
    const info = priceInfo(inspectionService, false);
    expect(info.amount).toBe(700);
    expect(info.label).toBe('Visit & diagnosis');
  });

  it('shows no charge while free inspection is on (matches create_booking after migration 119)', () => {
    const info = priceInfo(inspectionService, true);
    expect(info.amount).toBeNull();
    expect(info.label).toBe('Priced after inspection');
  });

  it('leaves fixed-price services unchanged when free inspection is on', () => {
    const info = priceInfo({ ...inspectionService, pricing_model: 'fixed', base_price: 1200 }, true);
    expect(info.amount).toBe(1200);
    expect(info.label).toBe('Booked price');
  });
});
