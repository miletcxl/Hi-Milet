# Neutral WS Contract

Envelope:

```json
{
  "type": "pet.action",
  "session_id": "desktop-main",
  "trace_id": "f4baf4...",
  "payload": {},
  "timestamp": "2026-03-07T12:00:00Z"
}
```

Inbound (`backend -> desktop`):

- `pet.action`
- `pet.speak`
- `pet.state`
- `approval.request`
- `system.notice`

Outbound (`desktop -> backend`):

- `user.event`
- `approval.result`
- `client.status`

Payload contracts:

- `pet.action.payload`: `{ action_id, mood?, duration_ms?, priority? }`
- `pet.speak.payload`: `{ text, stream?, expression?, interrupt? }`
- `approval.request.payload`: `{ request_id, command, reason, risk_level, timeout_ms }`
- `approval.result.payload`: `{ request_id, decision, note? }`
- `user.event.payload`: `{ event, target?, meta? }`
