import { afterEach, describe, expect, it, vi } from "vitest";
import { Budget } from "../src/lib/budget.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("Budget", () => {
  it("tracks remaining time", () => {
    const budget = new Budget(8000, 1_000);

    expect(budget.remainingMs(4_000)).toBe(5_000);
    expect(budget.remainingMs(10_000)).toBe(0);
  });

  it("aborts child signals at the tier timeout", () => {
    vi.useFakeTimers();
    const budget = new Budget(8000);
    const signal = budget.signal(1500);

    expect(signal.aborted).toBe(false);

    vi.advanceTimersByTime(1500);

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe("timeout");

    budget.cancel();
  });

  it("caps child signals at the global deadline", () => {
    vi.useFakeTimers();
    const budget = new Budget(1000);
    const signal = budget.signal(4000);

    vi.advanceTimersByTime(1000);

    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBe("deadline");
  });
});
