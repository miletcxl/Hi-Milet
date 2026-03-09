using System.Text.Json;
using System.Text.Json.Serialization;
using HiMilet.Protocol.Contracts;

namespace HiMilet.Protocol.Validation;

public static class EnvelopeJson
{
    public static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DictionaryKeyPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public static string Serialize<TPayload>(WsEnvelope<TPayload> envelope)
    {
        return JsonSerializer.Serialize(new
        {
            type = envelope.Type,
            session_id = envelope.SessionId,
            trace_id = envelope.TraceId,
            payload = envelope.Payload,
            timestamp = envelope.Timestamp,
        }, JsonOptions);
    }

    public static bool TryDeserialize(string rawJson, out WsEnvelope? envelope, out string? error)
    {
        envelope = null;
        error = null;

        try
        {
            using var doc = JsonDocument.Parse(rawJson);
            var root = doc.RootElement;

            if (!root.TryGetProperty("type", out var typeEl) || typeEl.ValueKind != JsonValueKind.String)
            {
                error = "Missing or invalid 'type'.";
                return false;
            }

            if (!root.TryGetProperty("session_id", out var sessionEl) || sessionEl.ValueKind != JsonValueKind.String)
            {
                error = "Missing or invalid 'session_id'.";
                return false;
            }

            if (!root.TryGetProperty("trace_id", out var traceEl) || traceEl.ValueKind != JsonValueKind.String)
            {
                error = "Missing or invalid 'trace_id'.";
                return false;
            }

            if (!root.TryGetProperty("payload", out var payloadEl))
            {
                error = "Missing 'payload'.";
                return false;
            }

            if (!root.TryGetProperty("timestamp", out var tsEl))
            {
                error = "Missing 'timestamp'.";
                return false;
            }

            DateTimeOffset timestamp;
            if (tsEl.ValueKind == JsonValueKind.String)
            {
                if (!DateTimeOffset.TryParse(tsEl.GetString(), out timestamp))
                {
                    error = "Invalid 'timestamp' format.";
                    return false;
                }
            }
            else
            {
                error = "Invalid 'timestamp' format.";
                return false;
            }

            envelope = new WsEnvelope(
                typeEl.GetString()!,
                sessionEl.GetString()!,
                traceEl.GetString()!,
                payloadEl.Clone(),
                timestamp
            );
            return true;
        }
        catch (Exception ex)
        {
            error = $"Invalid JSON: {ex.Message}";
            return false;
        }
    }

    public static TPayload? DeserializePayload<TPayload>(WsEnvelope envelope)
    {
        return envelope.Payload.Deserialize<TPayload>(JsonOptions);
    }
}
