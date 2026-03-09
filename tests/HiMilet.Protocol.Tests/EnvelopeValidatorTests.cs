using HiMilet.Protocol.Contracts;
using HiMilet.Protocol.Validation;
using System.Text.Json;

namespace HiMilet.Protocol.Tests;

public class EnvelopeValidatorTests
{
    [Fact]
    public void Validate_ReturnsOk_ForValidInboundEnvelope()
    {
        var payload = JsonDocument.Parse("{\"state\":\"Thinking\"}").RootElement;
        var envelope = new WsEnvelope(
            EnvelopeTypes.PetState,
            "s-1",
            "t-1",
            payload,
            DateTimeOffset.UtcNow);

        var result = EnvelopeValidator.Validate(envelope, EnvelopeDirection.Inbound);

        Assert.True(result.IsValid);
        Assert.Null(result.Error);
    }

    [Fact]
    public void Validate_ReturnsFail_WhenTypeIsUnsupported()
    {
        var payload = JsonDocument.Parse("{}").RootElement;
        var envelope = new WsEnvelope(
            "unknown.type",
            "s-1",
            "t-1",
            payload,
            DateTimeOffset.UtcNow);

        var result = EnvelopeValidator.Validate(envelope, EnvelopeDirection.Inbound);

        Assert.False(result.IsValid);
        Assert.Contains("Unsupported", result.Error);
    }
}
