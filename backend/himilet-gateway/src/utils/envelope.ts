import type { WsEnvelope } from '../types/protocol.js';

export function makeEnvelope<TPayload>(
  type: string,
  sessionId: string,
  payload: TPayload,
  traceId?: string,
): WsEnvelope<TPayload> {
  return {
    type,
    session_id: sessionId,
    trace_id: traceId ?? crypto.randomUUID().replaceAll('-', ''),
    payload,
    timestamp: new Date().toISOString(),
  };
}

export function parseEnvelope(raw: string): WsEnvelope | null {
  try {
    const obj = JSON.parse(raw) as WsEnvelope;
    if (!obj || typeof obj !== 'object') {
      return null;
    }
    if (!obj.type || !obj.session_id || !obj.trace_id || !obj.timestamp) {
      return null;
    }
    return obj;
  } catch {
    return null;
  }
}
