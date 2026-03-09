using HiMilet.Protocol.Contracts;
using HiMilet.Protocol.Validation;

namespace HiMilet.Protocol.Routing;

public interface IEnvelopeHandler
{
    Task HandleAsync(WsEnvelope envelope, CancellationToken cancellationToken = default);
}

public sealed class InboundMessageRouter
{
    private readonly Dictionary<string, IEnvelopeHandler> _handlers = new(StringComparer.Ordinal);

    public InboundMessageRouter Register(string envelopeType, IEnvelopeHandler handler)
    {
        _handlers[envelopeType] = handler;
        return this;
    }

    public async Task<bool> RouteAsync(string rawJson, CancellationToken cancellationToken = default)
    {
        if (!EnvelopeJson.TryDeserialize(rawJson, out var envelope, out _))
        {
            return false;
        }

        var validation = EnvelopeValidator.Validate(envelope!, EnvelopeDirection.Inbound);
        if (!validation.IsValid)
        {
            return false;
        }

        if (!_handlers.TryGetValue(envelope!.Type, out var handler))
        {
            return false;
        }

        await handler.HandleAsync(envelope!, cancellationToken).ConfigureAwait(false);
        return true;
    }
}
