/**
 * withTimeout：超时报错，完成后清除定时器
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { withTimeout } from '@/lib/sql/executor/timeout-handler';
import { ExecutorError, ExecutorErrorType } from '@/lib/sql/executor/types';

describe('withTimeout', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('先完成时返回结果，并清除超时定时器', async () => {
    jest.useFakeTimers();

    await expect(withTimeout(Promise.resolve('ok'), 30000)).resolves.toBe('ok');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('先失败时抛出原错误，并清除超时定时器', async () => {
    jest.useFakeTimers();

    await expect(withTimeout(Promise.reject(new Error('boom')), 30000)).rejects.toThrow('boom');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('超时时抛出 TIMEOUT_ERROR', async () => {
    jest.useFakeTimers();
    const pending = withTimeout(new Promise(() => undefined), 1000, '查询超时');
    const assertion = expect(pending).rejects.toMatchObject({
      type: ExecutorErrorType.TIMEOUT_ERROR,
      message: '查询超时',
    });

    jest.advanceTimersByTime(1000);

    await assertion;
    await expect(pending).rejects.toBeInstanceOf(ExecutorError);
  });
});
