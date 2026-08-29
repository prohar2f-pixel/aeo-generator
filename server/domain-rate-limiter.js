export class DomainRateLimiter {
  constructor({ limit = 10, windowMs = 60_000, now = Date.now } = {}) {
    this.maxRequests = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.requests = new Map();
  }

  async limit({ key }) {
    const normalizedKey = String(key).toLowerCase();
    const currentTime = this.now();
    const cutoff = currentTime - this.windowMs;
    const recent = (this.requests.get(normalizedKey) || []).filter(timestamp => timestamp > cutoff);
    const success = recent.length < this.maxRequests;
    if (success) recent.push(currentTime);
    if (recent.length > 0) this.requests.set(normalizedKey, recent);
    else this.requests.delete(normalizedKey);
    return { success };
  }
}
