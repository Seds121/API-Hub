export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Per-provider circuit breaker (per instance). Opens after `threshold` consecutive failures,
 * stays open for `cooldownMs`, then allows a single trial request.
 */
export class CircuitBreaker {
  private state: BreakerState = 'CLOSED';
  private failures = 0;
  private openedAt = 0;
  private trialInFlight = false;

  constructor(
    private readonly threshold = 5,
    private readonly cooldownMs = 30_000,
  ) {}

  canPass(now = Date.now()): boolean {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN' && now - this.openedAt >= this.cooldownMs) {
      this.state = 'HALF_OPEN';
      this.trialInFlight = false;
    }
    if (this.state === 'HALF_OPEN' && !this.trialInFlight) {
      this.trialInFlight = true;
      return true;
    }
    return false;
  }

  success() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.trialInFlight = false;
  }

  failure(now = Date.now()) {
    this.failures += 1;
    if (this.state === 'HALF_OPEN' || this.failures >= this.threshold) {
      this.state = 'OPEN';
      this.openedAt = now;
      this.trialInFlight = false;
    }
  }

  get snapshot() {
    return { state: this.state, failures: this.failures, openedAt: this.openedAt || null };
  }
}

/** Bounded concurrency per provider (per instance). */
export class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(
    private max: number,
    private readonly maxQueue = 200,
  ) {}

  setMax(n: number) {
    this.max = Math.max(1, n);
  }

  async acquire(timeoutMs: number): Promise<() => void> {
    if (this.active < this.max) {
      this.active++;
      return () => this.release();
    }
    if (this.queue.length >= this.maxQueue) throw new Error('CONCURRENCY_QUEUE_FULL');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.queue = this.queue.filter((f) => f !== grant);
        reject(new Error('CONCURRENCY_TIMEOUT'));
      }, timeoutMs);
      const grant = () => {
        clearTimeout(timer);
        this.active++;
        resolve(() => this.release());
      };
      this.queue.push(grant);
    });
  }

  private release() {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }

  get inFlight() {
    return this.active;
  }
}
