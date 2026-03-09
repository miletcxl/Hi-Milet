using HiMilet.Protocol.Routing;

namespace HiMilet.Protocol.Tests;

public class StateActionMappingTests
{
    [Theory]
    [InlineData("Idle", "pet.idle")]
    [InlineData("Thinking", "pet.thinking")]
    [InlineData("Work", "pet.work")]
    [InlineData("Sleep", "pet.sleep")]
    [InlineData("Approval", "pet.approval")]
    public void TryResolveAction_ReturnsExpectedAction(string state, string expected)
    {
        var ok = StateActionMapping.TryResolveAction(state, out var actionId);

        Assert.True(ok);
        Assert.Equal(expected, actionId);
    }

    [Fact]
    public void TryResolveAction_ReturnsFalse_ForUnknownState()
    {
        var ok = StateActionMapping.TryResolveAction("Unknown", out _);

        Assert.False(ok);
    }
}
