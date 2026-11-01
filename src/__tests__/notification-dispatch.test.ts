import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('notification dispatcher', () => {
  const route = read('src/app/api/cron/notification-dispatch/route.ts');
  const dispatch = read('src/lib/notifications/dispatch.ts');

  it('route requires the cron secret and is live only behind the env flag', () => {
    expect(route).toContain('CRON_SECRET');
    expect(route).toMatch(/NOTIFICATION_DISPATCH_ENABLED === 'true'/);
    expect(route.indexOf('authorised(request)')).toBeLessThan(route.indexOf('await dispatchPending'));
  });

  it('returns before any send or write when not live, and skips stale rows', () => {
    const i = dispatch.indexOf('if (!opts.live) return summary');
    expect(i).toBeGreaterThan(-1);
    expect(i).toBeLessThan(dispatch.indexOf('sendNotification({'));
    expect(i).toBeLessThan(dispatch.indexOf('.update('));
    expect(dispatch).toContain('maxAgeMinutes');
  });

  it('senders are no longer client-callable server actions', () => {
    for (const f of ['send', 'channels/whatsapp', 'channels/sms', 'channels/email']) {
      expect(read(`src/lib/notifications/${f}.ts`)).not.toMatch(/^"use server"/m);
    }
  });
});
