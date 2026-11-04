import { describe, expect, it } from 'vitest';
import {
  ACTIVE_STATES,
  JOB_STATES,
  STATE_META,
  TERMINAL_STATES,
  TRANSITIONS,
  canTransition,
  isActive,
  isTerminal,
  stateLabel,
} from './states';

describe('job states', () => {
  it('matches the states accepted by transition_job_state()', () => {
    expect([...JOB_STATES]).toEqual([
      'assigned',
      'accepted',
      'on_the_way',
      'arrived',
      'assessing',
      'in_progress',
      'quote_pending',
      'completed',
      'cancelled',
      'closed',
    ]);
  });

  it('has metadata and a transition list for every state', () => {
    for (const s of JOB_STATES) {
      expect(STATE_META[s].label).toBeTruthy();
      expect(TRANSITIONS[s]).toBeDefined();
    }
  });

  it('puts every state in exactly one of active or terminal', () => {
    for (const s of JOB_STATES) {
      expect(isActive(s) !== isTerminal(s)).toBe(true);
    }
    expect(ACTIVE_STATES).not.toContain('completed');
    expect(TERMINAL_STATES).toContain('closed');
  });

  it('mirrors the RPC transition table', () => {
    expect(canTransition('in_progress', 'quote_pending')).toBe(true);
    expect(canTransition('quote_pending', 'in_progress')).toBe(true);
    expect(canTransition('completed', 'closed')).toBe(true);
    expect(canTransition('arrived', 'assessing')).toBe(true);
    expect(canTransition('assessing', 'quote_pending')).toBe(true);
    expect(canTransition('quote_pending', 'assessing')).toBe(true);
    expect(canTransition('assessing', 'completed')).toBe(false);
    expect(canTransition('assessing', 'in_progress')).toBe(false);
    expect(canTransition('completed', 'in_progress')).toBe(false);
    expect(canTransition('IN_PROGRESS', 'completed')).toBe(false);
  });

  it('falls back to the raw value for unknown states', () => {
    expect(stateLabel('on_the_way')).toBe('On the way');
    expect(stateLabel('mystery')).toBe('mystery');
  });
});
