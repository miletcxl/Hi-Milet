using HiMilet.Protocol.Contracts;

namespace HiMilet.Protocol.Correlation;

public sealed record PendingApproval(
    string RequestId,
    string SessionId,
    string TraceId,
    DateTimeOffset CreatedAt,
    int TimeoutMs
);

public sealed class ApprovalTracker
{
    private readonly Dictionary<string, PendingApproval> _pending = new(StringComparer.Ordinal);
    private readonly object _lock = new();

    public void Track(ApprovalRequestPayload payload, string sessionId, string traceId, DateTimeOffset now)
    {
        var item = new PendingApproval(payload.RequestId, sessionId, traceId, now, payload.TimeoutMs);
        lock (_lock)
        {
            _pending[payload.RequestId] = item;
        }
    }

    public bool TryResolve(ApprovalResultPayload payload, out PendingApproval? pending)
    {
        lock (_lock)
        {
            if (_pending.TryGetValue(payload.RequestId, out var item))
            {
                _pending.Remove(payload.RequestId);
                pending = item;
                return true;
            }
        }

        pending = null;
        return false;
    }

    public int CleanupExpired(DateTimeOffset now)
    {
        List<string> expired;
        lock (_lock)
        {
            expired = _pending
                .Where(kvp => kvp.Value.CreatedAt.AddMilliseconds(kvp.Value.TimeoutMs) < now)
                .Select(kvp => kvp.Key)
                .ToList();

            foreach (var key in expired)
            {
                _pending.Remove(key);
            }
        }

        return expired.Count;
    }

    public bool HasPending(string requestId)
    {
        lock (_lock)
        {
            return _pending.ContainsKey(requestId);
        }
    }
}
