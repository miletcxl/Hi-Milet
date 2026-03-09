using System.Text.Json;
using HiMilet.Protocol.Contracts;

namespace HiMilet.Adapters.OpenClaw;

public sealed class OpenClawGatewayAdapter
{
    public IEnumerable<WsEnvelope<object>> AdaptInbound(string rawJson, string sessionId)
    {
        using var doc = JsonDocument.Parse(rawJson);
        var root = doc.RootElement;
        var now = DateTimeOffset.UtcNow;

        var traceId = root.TryGetProperty("id", out var idEl) && idEl.ValueKind == JsonValueKind.String
            ? idEl.GetString()!
            : Guid.NewGuid().ToString("N");

        var eventType = root.TryGetProperty("event", out var eventEl) && eventEl.ValueKind == JsonValueKind.String
            ? eventEl.GetString()!
            : string.Empty;

        if (eventType.Equals("chat", StringComparison.OrdinalIgnoreCase))
        {
            var text = root.TryGetProperty("text", out var textEl) ? textEl.GetString() : null;
            if (!string.IsNullOrWhiteSpace(text))
            {
                yield return new WsEnvelope<object>(
                    EnvelopeTypes.PetSpeak,
                    sessionId,
                    traceId,
                    new PetSpeakPayload(text!, Stream: false),
                    now);
            }

            yield break;
        }

        if (eventType.Equals("agent_event", StringComparison.OrdinalIgnoreCase))
        {
            var state = root.TryGetProperty("state", out var stateEl) ? stateEl.GetString() : null;
            if (!string.IsNullOrWhiteSpace(state))
            {
                yield return new WsEnvelope<object>(
                    EnvelopeTypes.PetState,
                    sessionId,
                    traceId,
                    new PetStatePayload(state!),
                    now);
            }

            yield break;
        }

        if (eventType.Equals("approval_required", StringComparison.OrdinalIgnoreCase))
        {
            var requestId = root.TryGetProperty("request_id", out var rqEl) ? rqEl.GetString() : Guid.NewGuid().ToString("N");
            var command = root.TryGetProperty("command", out var cmdEl) ? cmdEl.GetString() : "";
            var reason = root.TryGetProperty("reason", out var rsEl) ? rsEl.GetString() : "";
            var risk = root.TryGetProperty("risk_level", out var rkEl) ? rkEl.GetString() : "medium";
            var timeoutMs = root.TryGetProperty("timeout_ms", out var toEl) && toEl.TryGetInt32(out var parsed)
                ? parsed
                : 60_000;

            yield return new WsEnvelope<object>(
                EnvelopeTypes.ApprovalRequest,
                sessionId,
                traceId,
                new ApprovalRequestPayload(requestId ?? Guid.NewGuid().ToString("N"), command ?? "", reason ?? "", risk ?? "medium", timeoutMs),
                now);
            yield break;
        }

        if (eventType.Equals("tool_call", StringComparison.OrdinalIgnoreCase) ||
            eventType.Equals("skill_call", StringComparison.OrdinalIgnoreCase))
        {
            var requestId = root.TryGetProperty("request_id", out var rqEl) && rqEl.ValueKind == JsonValueKind.String
                ? rqEl.GetString()
                : traceId;
            var skill = root.TryGetProperty("tool", out var toolEl) && toolEl.ValueKind == JsonValueKind.String
                ? toolEl.GetString()
                : root.TryGetProperty("skill", out var skillEl) && skillEl.ValueKind == JsonValueKind.String
                    ? skillEl.GetString()
                    : "unknown";

            var arguments = root.TryGetProperty("arguments", out var argEl)
                ? argEl.Clone()
                : root.TryGetProperty("args", out var argsEl)
                    ? argsEl.Clone()
                    : JsonSerializer.SerializeToElement(new { });

            var timeoutMs = root.TryGetProperty("timeout_ms", out var toEl) && toEl.TryGetInt32(out var parsed)
                ? parsed
                : (int?)null;

            yield return new WsEnvelope<object>(
                EnvelopeTypes.SkillInvoke,
                sessionId,
                traceId,
                new SkillInvokePayload(requestId ?? traceId, skill ?? "unknown", arguments, timeoutMs),
                now);
            yield break;
        }

        yield return new WsEnvelope<object>(
            EnvelopeTypes.SystemNotice,
            sessionId,
            traceId,
            new SystemNoticePayload($"Unhandled OpenClaw event: {eventType}", "debug"),
            now);
    }

    public object AdaptOutbound(WsEnvelope outbound)
    {
        return outbound.Type switch
        {
            EnvelopeTypes.UserEvent => new
            {
                method = "chat.inject",
                payload = outbound.Payload,
                trace_id = outbound.TraceId,
            },
            EnvelopeTypes.ApprovalResult => new
            {
                method = "approval.reply",
                payload = outbound.Payload,
                trace_id = outbound.TraceId,
            },
            EnvelopeTypes.ClientStatus => new
            {
                method = "client.status",
                payload = outbound.Payload,
                trace_id = outbound.TraceId,
            },
            EnvelopeTypes.SkillResult => new
            {
                method = "tool.result",
                payload = outbound.Payload,
                trace_id = outbound.TraceId,
            },
            _ => new
            {
                method = "noop",
                payload = outbound.Payload,
                trace_id = outbound.TraceId,
            },
        };
    }
}
