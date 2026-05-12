export class Budget {
  private readonly deadlineMs: number;
  private readonly root = new AbortController();
  private readonly timer: NodeJS.Timeout;

  constructor(totalMs: number, now = Date.now()) {
    this.deadlineMs = now + totalMs;
    this.timer = setTimeout(() => this.root.abort("deadline"), Math.max(0, totalMs));
  }

  remainingMs(now = Date.now()): number {
    return Math.max(0, this.deadlineMs - now);
  }

  expired(now = Date.now()): boolean {
    return this.remainingMs(now) === 0 || this.root.signal.aborted;
  }

  signal(limitMs: number): AbortSignal {
    const child = new AbortController();
    const timeoutMs = Math.min(this.remainingMs(), Math.max(0, limitMs));

    if (this.root.signal.aborted || timeoutMs === 0) {
      child.abort(this.root.signal.reason ?? "deadline");
      return child.signal;
    }

    const abortChild = () => child.abort(this.root.signal.reason ?? "deadline");
    const childTimer = setTimeout(() => child.abort("timeout"), timeoutMs);

    this.root.signal.addEventListener("abort", abortChild, { once: true });
    child.signal.addEventListener(
      "abort",
      () => {
        clearTimeout(childTimer);
        this.root.signal.removeEventListener("abort", abortChild);
      },
      { once: true },
    );

    return child.signal;
  }

  cancel(): void {
    clearTimeout(this.timer);
    this.root.abort("cancelled");
  }
}
