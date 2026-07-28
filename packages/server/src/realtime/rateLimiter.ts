import { RATE_LIMITS, type RateLimitedAction } from '@bingo/shared';

/**
 * Per-player, per-action sliding-window limiter.
 *
 * One instance per connection, discarded when the player leaves, so a
 * disconnect-reconnect loop cannot be used to farm allowances - the room
 * carries the limiter across the reconnection window on purpose.
 *
 * Deliberately in-memory and per-process: this guards a single room's message
 * loop, not the HTTP API (which has its own limiter). A player is only ever
 * connected to one room instance at a time, so there is nothing to share.
 */
interface Window {
  /** Timestamps of the calls still inside the window, oldest first. */
  hits: number[];
}

export class ActionRateLimiter {
  private readonly windows = new Map<RateLimitedAction, Window>();

  /**
   * Returns null when the action is allowed, or the milliseconds to wait.
   * Consumes an allowance when it returns null.
   */
  check(action: RateLimitedAction, now = Date.now()): number | null {
    const limit = RATE_LIMITS[action];
    let window = this.windows.get(action);
    if (!window) {
      window = { hits: [] };
      this.windows.set(action, window);
    }

    const cutoff = now - limit.windowMs;
    // Hits are appended in order, so dropping the expired prefix is enough.
    let expired = 0;
    while (expired < window.hits.length && (window.hits[expired] as number) <= cutoff) {
      expired += 1;
    }
    if (expired > 0) window.hits.splice(0, expired);

    if (window.hits.length >= limit.points) {
      const oldest = window.hits[0] as number;
      return Math.max(1, oldest + limit.windowMs - now);
    }

    window.hits.push(now);
    return null;
  }

  /** How many allowances remain right now, without consuming one. */
  remaining(action: RateLimitedAction, now = Date.now()): number {
    const limit = RATE_LIMITS[action];
    const window = this.windows.get(action);
    if (!window) return limit.points;
    const cutoff = now - limit.windowMs;
    const live = window.hits.filter((hit) => hit > cutoff).length;
    return Math.max(0, limit.points - live);
  }

  reset(): void {
    this.windows.clear();
  }
}
