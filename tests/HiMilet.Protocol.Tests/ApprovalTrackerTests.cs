using HiMilet.Protocol.Contracts;
using HiMilet.Protocol.Correlation;

namespace HiMilet.Protocol.Tests;

public class ApprovalTrackerTests
{
    [Fact]
    public void Track_ThenResolve_ShouldMatchRequest()
    {
        var tracker = new ApprovalTracker();
        var request = new ApprovalRequestPayload(
            "req-1",
            "npm install -g marp-cli",
            "Need dependency",
            "high",
            10_000);

        tracker.Track(request, "session-a", "trace-a", DateTimeOffset.UtcNow);
        var ok = tracker.TryResolve(new ApprovalResultPayload("req-1", "allow"), out var pending);

        Assert.True(ok);
        Assert.NotNull(pending);
        Assert.Equal("req-1", pending!.RequestId);
        Assert.Equal("session-a", pending.SessionId);
    }

    [Fact]
    public void CleanupExpired_ShouldRemoveExpiredRequests()
    {
        var tracker = new ApprovalTracker();
        var now = DateTimeOffset.UtcNow;

        tracker.Track(new ApprovalRequestPayload("req-expired", "cmd", "reason", "low", 1), "s", "t", now);
        var removed = tracker.CleanupExpired(now.AddSeconds(1));

        Assert.Equal(1, removed);
        Assert.False(tracker.HasPending("req-expired"));
    }
}
