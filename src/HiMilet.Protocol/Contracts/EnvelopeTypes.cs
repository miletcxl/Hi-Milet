namespace HiMilet.Protocol.Contracts;

public static class EnvelopeTypes
{
    public const string PetAction = "pet.action";
    public const string PetSpeak = "pet.speak";
    public const string PetState = "pet.state";
    public const string ApprovalRequest = "approval.request";
    public const string ApprovalResult = "approval.result";
    public const string UserEvent = "user.event";
    public const string SkillInvoke = "skill.invoke";
    public const string SkillResult = "skill.result";
    public const string ChatUser = "chat.user";
    public const string ChatAssistant = "chat.assistant";
    public const string ChatContinue = "chat.continue";
    public const string ClientStatus = "client.status";
    public const string SystemNotice = "system.notice";

    public static readonly HashSet<string> InboundTypes =
    [
        PetAction,
        PetSpeak,
        PetState,
        ApprovalRequest,
        SkillInvoke,
        ChatAssistant,
        SystemNotice,
    ];

    public static readonly HashSet<string> OutboundTypes =
    [
        UserEvent,
        ApprovalResult,
        SkillResult,
        ChatUser,
        ChatContinue,
        ClientStatus,
    ];
}
