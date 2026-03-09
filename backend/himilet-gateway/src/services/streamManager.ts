interface ActiveStream {
  streamId: string;
  sessionId: string;
  connectionId: string;
  conversationId: string;
  assistantMessageId: string;
  abortController: AbortController;
  markInterrupted: () => Promise<void>;
}

export class StreamManager {
  private readonly streamsBySession = new Map<string, ActiveStream>();

  start(stream: ActiveStream): void {
    const existing = this.streamsBySession.get(stream.sessionId);
    if (existing) {
      void this.cancelBySession(stream.sessionId, 'replaced');
    }
    this.streamsBySession.set(stream.sessionId, stream);
  }

  getBySession(sessionId: string): ActiveStream | undefined {
    return this.streamsBySession.get(sessionId);
  }

  isCurrent(sessionId: string, streamId: string, connectionId?: string): boolean {
    const stream = this.streamsBySession.get(sessionId);
    if (!stream) {
      return false;
    }

    if (stream.streamId !== streamId) {
      return false;
    }

    if (connectionId && stream.connectionId !== connectionId) {
      return false;
    }

    return true;
  }

  async cancelBySession(sessionId: string, _reason: string): Promise<void> {
    const stream = this.streamsBySession.get(sessionId);
    if (!stream) {
      return;
    }

    this.streamsBySession.delete(sessionId);
    stream.abortController.abort();
    await stream.markInterrupted();
  }

  complete(sessionId: string, streamId: string): void {
    const stream = this.streamsBySession.get(sessionId);
    if (!stream) {
      return;
    }
    if (stream.streamId === streamId) {
      this.streamsBySession.delete(sessionId);
    }
  }
}
