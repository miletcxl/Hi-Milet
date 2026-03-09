import { describe, expect, it, vi } from 'vitest';
import { StreamManager } from '../src/services/streamManager.js';

describe('StreamManager', () => {
  it('cancels previous stream on same session', async () => {
    const manager = new StreamManager();
    const interruptedA = vi.fn(async () => undefined);
    const interruptedB = vi.fn(async () => undefined);
    const abortA = new AbortController();
    const abortB = new AbortController();

    manager.start({
      streamId: 's1',
      sessionId: 'session-a',
      connectionId: 'c1',
      conversationId: 'conv',
      assistantMessageId: 'm1',
      abortController: abortA,
      markInterrupted: interruptedA,
    });

    manager.start({
      streamId: 's2',
      sessionId: 'session-a',
      connectionId: 'c2',
      conversationId: 'conv',
      assistantMessageId: 'm2',
      abortController: abortB,
      markInterrupted: interruptedB,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(abortA.signal.aborted).toBe(true);
    expect(interruptedA).toHaveBeenCalledTimes(1);
    expect(manager.getBySession('session-a')?.streamId).toBe('s2');
  });

  it('checks active stream identity with stream_id and connection_id', () => {
    const manager = new StreamManager();
    const abort = new AbortController();

    manager.start({
      streamId: 'stream-1',
      sessionId: 'session-a',
      connectionId: 'conn-1',
      conversationId: 'conv-1',
      assistantMessageId: 'msg-1',
      abortController: abort,
      markInterrupted: async () => undefined,
    });

    expect(manager.isCurrent('session-a', 'stream-1')).toBe(true);
    expect(manager.isCurrent('session-a', 'stream-1', 'conn-1')).toBe(true);
    expect(manager.isCurrent('session-a', 'stream-2')).toBe(false);
    expect(manager.isCurrent('session-a', 'stream-1', 'conn-2')).toBe(false);
  });
});
