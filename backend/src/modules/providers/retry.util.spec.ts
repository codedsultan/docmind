import { withRetry, isRetryableStatus } from './retry.util';

describe('isRetryableStatus', () => {
  it('returns true for 429', () => expect(isRetryableStatus(429)).toBe(true));
  it('returns true for 500', () => expect(isRetryableStatus(500)).toBe(true));
  it('returns true for 503', () => expect(isRetryableStatus(503)).toBe(true));
  it('returns false for 400', () => expect(isRetryableStatus(400)).toBe(false));
  it('returns false for 404', () => expect(isRetryableStatus(404)).toBe(false));
  it('returns false for 200', () => expect(isRetryableStatus(200)).toBe(false));
});

const makeResponse = (status: number, ok: boolean = status < 400): Response =>
  ({ status, ok }) as Response;

describe('withRetry', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns response on first success without retrying', async () => {
    const fn = jest.fn().mockResolvedValue(makeResponse(200));

    const promise = withRetry(fn);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(200);
  });

  it('retries on 429 then returns success', async () => {
    const fn = jest
      .fn()
      .mockResolvedValueOnce(makeResponse(429, false))
      .mockResolvedValueOnce(makeResponse(200));

    const promise = withRetry(fn, { baseDelayMs: 10 });
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
  });

  it('retries on 503 then returns success', async () => {
    const fn = jest
      .fn()
      .mockResolvedValueOnce(makeResponse(503, false))
      .mockResolvedValueOnce(makeResponse(200));

    const promise = withRetry(fn, { baseDelayMs: 10 });
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
  });

  it('retries on network error then returns success', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValueOnce(makeResponse(200));

    const promise = withRetry(fn, { baseDelayMs: 10 });
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.status).toBe(200);
  });

  it('returns the last 500 response after exhausting retries (caller handles error)', async () => {
    const fn = jest.fn().mockResolvedValue(makeResponse(500, false));

    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe(500);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all retries on persistent network errors', async () => {
    const networkError = new Error('Network failure');
    const fn = jest.fn().mockRejectedValue(networkError);

    const promise = withRetry(fn, { maxRetries: 3, baseDelayMs: 10 });
    // Create assertion before advancing timers to attach rejection handler early
    const assertion = expect(promise).rejects.toThrow('Network failure');
    await jest.runAllTimersAsync();
    await assertion;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry non-retryable 4xx errors', async () => {
    const fn = jest.fn().mockResolvedValue(makeResponse(400, false));

    const promise = withRetry(fn, { baseDelayMs: 10 });
    await jest.runAllTimersAsync();
    const result = await promise;

    // 400 is not retryable — returned immediately
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.status).toBe(400);
  });

  it('calls onRetry callback with attempt and status on retryable failure', async () => {
    const fn = jest
      .fn()
      .mockResolvedValueOnce(makeResponse(429, false))
      .mockResolvedValueOnce(makeResponse(200));

    const onRetry = jest.fn();
    const promise = withRetry(fn, { baseDelayMs: 10 }, onRetry);
    await jest.runAllTimersAsync();
    await promise;

    expect(onRetry).toHaveBeenCalledWith(0, 429, expect.any(Error));
  });

  it('respects custom maxRetries option (returns last response after exhausting)', async () => {
    const fn = jest.fn().mockResolvedValue(makeResponse(503, false));

    const promise = withRetry(fn, { maxRetries: 2, baseDelayMs: 10 });
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result.status).toBe(503);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
