namespace HiMilet.Protocol.Routing;

public static class StateActionMapping
{
    private static readonly Dictionary<string, string> StateToAction =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["Idle"] = "pet.idle",
            ["Thinking"] = "pet.thinking",
            ["Work"] = "pet.work",
            ["Sleep"] = "pet.sleep",
            ["Approval"] = "pet.approval",
        };

    public static bool TryResolveAction(string state, out string actionId)
    {
        if (string.IsNullOrWhiteSpace(state))
        {
            actionId = string.Empty;
            return false;
        }

        return StateToAction.TryGetValue(state.Trim(), out actionId!);
    }

    public static IReadOnlyCollection<string> KnownStates => StateToAction.Keys;
}
