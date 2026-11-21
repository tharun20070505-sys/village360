// Production-grade Circuit Breaker pattern implementation
export class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5; // failures before opening
    this.cooldownPeriod = options.cooldownPeriod || 10000; // 10s cooldown before probe
    this.timeout = options.timeout || 8000; // 8s max execution time
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
    this.lastStateChange = Date.now();
    this.history = [];
  }

  logTransition(toState) {
    const record = { from: this.state, to: toState, at: new Date().toISOString() };
    this.history.unshift(record);
    if (this.history.length > 20) this.history.pop();
    this.state = toState;
    this.lastStateChange = Date.now();
  }

  async execute(action, fallback = null) {
    const now = Date.now();

    // Check if OPEN cooldown has elapsed -> switch to HALF_OPEN
    if (this.state === 'OPEN') {
      if (now - this.lastFailureTime > this.cooldownPeriod) {
        this.logTransition('HALF_OPEN');
      } else {
        if (typeof fallback === 'function') return fallback(new Error('Circuit breaker is OPEN'));
        const err = new Error(`Service [${this.name}] is temporarily unavailable (circuit OPEN).`);
        err.status = 503;
        throw err;
      }
    }

    try {
      // Execute with timeout
      const result = await Promise.race([
        action(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Operation timed out after ${this.timeout}ms`)), this.timeout)
        )
      ]);

      // Success handling
      if (this.state === 'HALF_OPEN') {
        this.logTransition('CLOSED');
        this.failureCount = 0;
      }
      this.successCount++;
      return result;
    } catch (err) {
      this.failureCount++;
      this.lastFailureTime = Date.now();

      if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
        if (this.state !== 'OPEN') this.logTransition('OPEN');
      }

      if (typeof fallback === 'function') {
        return fallback(err);
      }
      throw err;
    }
  }

  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailure: this.lastFailureTime ? new Date(this.lastFailureTime).toISOString() : null,
      lastStateChange: new Date(this.lastStateChange).toISOString(),
      recentTransitions: this.history.slice(0, 5)
    };
  }
}

export const dbBreaker = new CircuitBreaker({ name: 'Database', failureThreshold: 5, cooldownPeriod: 10000 });
