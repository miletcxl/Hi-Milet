namespace HiMilet.Adapters.OpenClaw;

public sealed record CapabilityDescriptor(string Name, string Description, bool EnabledByDefault = false);

public static class CapabilityRegistry
{
    public static readonly IReadOnlyList<CapabilityDescriptor> Default =
    [
        new("health.reminder.water", "Hydration reminder capability", false),
        new("health.reminder.sedentary", "Sedentary reminder capability", false),
        new("todo.reminder", "Todo reminder capability", false),
        new("docs.render.pdf", "Markdown to PDF capability", false),
        new("docs.render.pptx", "Markdown to PPTX capability", false),
    ];
}
