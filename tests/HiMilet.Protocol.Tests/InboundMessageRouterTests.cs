using HiMilet.Protocol.Contracts;
using HiMilet.Protocol.Routing;
using HiMilet.Protocol.Validation;

namespace HiMilet.Protocol.Tests;

public class InboundMessageRouterTests
{
    [Fact]
    public async Task RouteAsync_InvokesRegisteredHandler()
    {
        var handler = new CaptureHandler();
        var router = new InboundMessageRouter().Register(EnvelopeTypes.PetState, handler);

        var raw = EnvelopeJson.Serialize(new WsEnvelope<object>(
            EnvelopeTypes.PetState,
            "session-main",
            "trace-123",
            new PetStatePayload("Thinking"),
            DateTimeOffset.UtcNow));

        var routed = await router.RouteAsync(raw);

        Assert.True(routed);
        Assert.NotNull(handler.LastEnvelope);
        Assert.Equal(EnvelopeTypes.PetState, handler.LastEnvelope!.Type);
    }

    [Fact]
    public async Task RouteAsync_ReturnsFalse_ForUnknownType()
    {
        var router = new InboundMessageRouter();

        var raw = EnvelopeJson.Serialize(new WsEnvelope<object>(
            EnvelopeTypes.PetState,
            "session-main",
            "trace-unknown",
            new PetStatePayload("Idle"),
            DateTimeOffset.UtcNow));

        var routed = await router.RouteAsync(raw);

        Assert.False(routed);
    }

    private sealed class CaptureHandler : IEnvelopeHandler
    {
        public WsEnvelope? LastEnvelope { get; private set; }

        public Task HandleAsync(WsEnvelope envelope, CancellationToken cancellationToken = default)
        {
            LastEnvelope = envelope;
            return Task.CompletedTask;
        }
    }
}
