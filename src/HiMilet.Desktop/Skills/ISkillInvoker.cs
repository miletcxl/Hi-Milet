using HiMilet.Protocol.Contracts;

namespace HiMilet.Desktop.Skills;

public interface ISkillInvoker
{
    Task<SkillResultPayload> InvokeAsync(SkillInvokePayload payload, CancellationToken cancellationToken = default);
}
