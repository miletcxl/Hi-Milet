using System.Text.Json;

namespace HiMilet.Protocol.Contracts;

public sealed record WsEnvelope(
    string Type,
    string SessionId,
    string TraceId,
    JsonElement Payload,
    DateTimeOffset Timestamp
);

public sealed record WsEnvelope<TPayload>(
    string Type,
    string SessionId,
    string TraceId,
    TPayload Payload,
    DateTimeOffset Timestamp
);

public sealed record EnvelopeValidationResult(bool IsValid, string? Error)
{
    public static EnvelopeValidationResult Ok() => new(true, null);
    public static EnvelopeValidationResult Fail(string error) => new(false, error);
}
