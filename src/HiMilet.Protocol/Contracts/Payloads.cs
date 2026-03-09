using System.Text.Json;

namespace HiMilet.Protocol.Contracts;

public sealed record PetActionPayload(
    string ActionId,
    string? Mood = null,
    int? DurationMs = null,
    int? Priority = null
);

public sealed record PetSpeakPayload(
    string Text,
    bool Stream = false,
    string? Expression = null,
    bool Interrupt = false
);

public sealed record PetStatePayload(
    string State,
    string? Reason = null
);

public sealed record ApprovalRequestPayload(
    string RequestId,
    string Command,
    string Reason,
    string RiskLevel,
    int TimeoutMs
);

public sealed record ApprovalResultPayload(
    string RequestId,
    string Decision,
    string? Note = null
);

public sealed record UserEventPayload(
    string Event,
    string? Target = null,
    string? Meta = null
);

public sealed record ChatUserPayload(
    string ConversationId,
    string MessageId,
    string Text
);

public sealed record ChatAssistantPayload(
    string ConversationId,
    string MessageId,
    string Text,
    string StreamId,
    int Seq,
    bool IsFinal,
    bool? Interrupted = null
);

public sealed record ChatContinuePayload(
    string ConversationId,
    string ParentMessageId
);

public sealed record SkillInvokePayload(
    string RequestId,
    string Skill,
    JsonElement Arguments,
    int? TimeoutMs = null
);

public sealed record SkillResultPayload(
    string RequestId,
    string Status,
    JsonElement? Output = null,
    string? Error = null
);

public sealed record ClientStatusPayload(
    string Status,
    string? Detail = null
);

public sealed record SystemNoticePayload(
    string Message,
    string? Level = null
);
