using HiMilet.Protocol.Routing;

namespace HiMilet.Desktop.Pet;

public sealed class ActionMapper
{
    private readonly PetRuntime _runtime;

    public ActionMapper(PetRuntime runtime)
    {
        _runtime = runtime;
    }

    public bool ApplyActionId(string actionId)
    {
        if (string.IsNullOrWhiteSpace(actionId))
        {
            return false;
        }

        return _runtime.TryRunAction(actionId.Trim());
    }

    public bool ApplyState(string state)
    {
        if (!StateActionMapping.TryResolveAction(state, out var actionId))
        {
            return false;
        }

        return ApplyActionId(actionId);
    }
}
