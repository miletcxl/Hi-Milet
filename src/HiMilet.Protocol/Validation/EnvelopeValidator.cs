using HiMilet.Protocol.Contracts;

namespace HiMilet.Protocol.Validation;

public enum EnvelopeDirection
{
    Inbound,
    Outbound,
}

public static class EnvelopeValidator
{
    public static EnvelopeValidationResult Validate(WsEnvelope envelope, EnvelopeDirection direction)
    {
        if (string.IsNullOrWhiteSpace(envelope.Type))
        {
            return EnvelopeValidationResult.Fail("Envelope type is required.");
        }

        if (string.IsNullOrWhiteSpace(envelope.SessionId))
        {
            return EnvelopeValidationResult.Fail("session_id is required.");
        }

        if (string.IsNullOrWhiteSpace(envelope.TraceId))
        {
            return EnvelopeValidationResult.Fail("trace_id is required.");
        }

        var typeSet = direction == EnvelopeDirection.Inbound
            ? EnvelopeTypes.InboundTypes
            : EnvelopeTypes.OutboundTypes;

        if (!typeSet.Contains(envelope.Type))
        {
            return EnvelopeValidationResult.Fail($"Unsupported envelope type '{envelope.Type}' for {direction} direction.");
        }

        if (envelope.Payload.ValueKind is System.Text.Json.JsonValueKind.Undefined)
        {
            return EnvelopeValidationResult.Fail("payload is required.");
        }

        if (envelope.Timestamp == default)
        {
            return EnvelopeValidationResult.Fail("timestamp is required.");
        }

        return EnvelopeValidationResult.Ok();
    }
}
