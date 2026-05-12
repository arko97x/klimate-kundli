export interface RequestTelemetry {
  ms: number;
  fallbacks: string[];
  cacheHits: number;
  cacheMisses: number;
  partial: boolean;
}

export class Telemetry {
  private totalRequests = 0;
  private totalMs = 0;
  private readonly fallbacksByTier = {
    geocoding: { tier1: 0, tier2: 0, tier3: 0, tier4: 0 },
    historical: { tier1: 0, tier2: 0, tier3: 0, tier4: 0 },
    projection: { tier1: 0, tier2: 0, tier3: 0 },
  };

  recordKundli(summary: RequestTelemetry): void {
    this.totalRequests += 1;
    this.totalMs += summary.ms;
    console.log(
      JSON.stringify({
        t: new Date().toISOString(),
        endpoint: "/kundli",
        ms: summary.ms,
        fallbacks: summary.fallbacks,
        cacheHits: summary.cacheHits,
        cacheMisses: summary.cacheMisses,
        partial: summary.partial,
      }),
    );
  }

  stats(cacheSize: number, cacheHitRate: number) {
    return {
      uptime: Math.floor(process.uptime()),
      totalRequests: this.totalRequests,
      cacheHitRate,
      cacheSize,
      fallbacksByTier: this.fallbacksByTier,
      avgResponseMs: this.totalRequests === 0 ? 0 : this.totalMs / this.totalRequests,
    };
  }
}
