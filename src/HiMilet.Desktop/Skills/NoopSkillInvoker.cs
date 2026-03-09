using System.Text.Json;
using HiMilet.Protocol.Contracts;

namespace HiMilet.Desktop.Skills;

public sealed class NoopSkillInvoker : ISkillInvoker
{
    private static readonly JsonElement EmptyOutput = JsonSerializer.SerializeToElement(new { });

    public Task<SkillResultPayload> InvokeAsync(SkillInvokePayload payload, CancellationToken cancellationToken = default)
    {
        var result = new SkillResultPayload(
            payload.RequestId,
            "unsupported",
            EmptyOutput,
            $"skill '{payload.Skill}' is not registered");

        return Task.FromResult(result);
    }
}
