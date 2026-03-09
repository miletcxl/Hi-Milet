using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace HiMilet.Desktop.Config;

public sealed class FrontEndConfig
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
    public Uri GatewayUrl { get; set; } = new("ws://127.0.0.1:18789");
    public Uri BackendHttpUrl { get; set; } = new("http://127.0.0.1:18790");
    public bool UseOpenClawAdapter { get; set; }
    public string SessionId { get; set; } = "desktop-main";
    public string PetConfigPath { get; set; } = Path.Combine(
        AppContext.BaseDirectory,
        "..",
        "..",
        "..",
        "..",
        "..",
        "..",
        "VPet",
        "VPet-Simulator.Windows",
        "mod",
        "0000_core",
        "pet",
        "vup.lps");
    public int RenderResolution { get; set; } = 1000;
    public int LogicIntervalMs { get; set; } = 15_000;
    public int InteractionCycle { get; set; } = 200;
    public int PressLengthMs { get; set; } = 300;
    public double ZoomRatio { get; set; } = 0.5;
    public bool EnableFunction { get; set; } = true;
    public bool Topmost { get; set; } = true;
    public bool PetClickThrough { get; set; }
    public string? ActiveProfileId { get; set; }
    public InteractionConfig Interaction { get; set; } = new();

    public static string ResolveConfigFilePath() =>
        Path.GetFullPath(Path.Combine(
            AppContext.BaseDirectory,
            "..",
            "..",
            "..",
            "..",
            "config",
            "desktop-settings.json"));

    public FrontEndConfig Clone()
    {
        return new FrontEndConfig
        {
            UpdatedAt = UpdatedAt,
            GatewayUrl = new Uri(GatewayUrl.ToString()),
            BackendHttpUrl = new Uri(BackendHttpUrl.ToString()),
            UseOpenClawAdapter = UseOpenClawAdapter,
            SessionId = SessionId,
            PetConfigPath = PetConfigPath,
            RenderResolution = RenderResolution,
            LogicIntervalMs = LogicIntervalMs,
            InteractionCycle = InteractionCycle,
            PressLengthMs = PressLengthMs,
            ZoomRatio = ZoomRatio,
            EnableFunction = EnableFunction,
            Topmost = Topmost,
            PetClickThrough = PetClickThrough,
            ActiveProfileId = ActiveProfileId,
            Interaction = Interaction.Clone(),
        };
    }

    public static async Task<FrontEndConfig?> TryLoadFileAsync(string? filePath = null)
    {
        var path = filePath ?? ResolveConfigFilePath();
        if (!File.Exists(path))
        {
            return null;
        }

        var raw = await File.ReadAllTextAsync(path);
        var parsed = JsonSerializer.Deserialize<FrontEndConfig>(raw, JsonOptions);
        if (parsed is null)
        {
            return null;
        }

        parsed.Normalize();
        return parsed;
    }

    public async Task SaveFileAsync(string? filePath = null)
    {
        UpdatedAt = DateTimeOffset.UtcNow;
        Normalize();
        var path = filePath ?? ResolveConfigFilePath();
        var dir = Path.GetDirectoryName(path);
        if (!string.IsNullOrWhiteSpace(dir))
        {
            Directory.CreateDirectory(dir);
        }

        var json = JsonSerializer.Serialize(this, JsonOptions);
        await File.WriteAllTextAsync(path, json);
    }

    public void Normalize()
    {
        GatewayUrl = new Uri(GatewayUrl.ToString());
        BackendHttpUrl = new Uri(BackendHttpUrl.ToString());
        SessionId = string.IsNullOrWhiteSpace(SessionId) ? "desktop-main" : SessionId.Trim();
        PetConfigPath = string.IsNullOrWhiteSpace(PetConfigPath) ? ResolveDefaultPetConfigPath() : PetConfigPath;
        RenderResolution = Math.Clamp(RenderResolution, 100, 4000);
        LogicIntervalMs = Math.Clamp(LogicIntervalMs, 1000, 120000);
        InteractionCycle = Math.Clamp(InteractionCycle, 10, 6000);
        PressLengthMs = Math.Clamp(PressLengthMs, 100, 5000);
        ZoomRatio = Math.Clamp(ZoomRatio, 0.1, 2.0);
        Interaction = Interaction?.NormalizeAndReturn() ?? new InteractionConfig();
    }

    private static string ResolveDefaultPetConfigPath() => Path.Combine(
        AppContext.BaseDirectory,
        "..",
        "..",
        "..",
        "..",
        "..",
        "..",
        "VPet",
        "VPet-Simulator.Windows",
        "mod",
        "0000_core",
        "pet",
        "vup.lps");
}

public sealed class InteractionConfig
{
    public bool Enabled { get; set; } = true;
    public int ProactiveIntervalMinutes { get; set; } = 20;
    public int QuietHoursStart { get; set; } = 23;
    public int QuietHoursEnd { get; set; } = 8;
    public int MaxSpeechChars { get; set; } = 36;

    public InteractionConfig Clone()
    {
        return new InteractionConfig
        {
            Enabled = Enabled,
            ProactiveIntervalMinutes = ProactiveIntervalMinutes,
            QuietHoursStart = QuietHoursStart,
            QuietHoursEnd = QuietHoursEnd,
            MaxSpeechChars = MaxSpeechChars,
        };
    }

    public InteractionConfig NormalizeAndReturn()
    {
        ProactiveIntervalMinutes = Math.Clamp(ProactiveIntervalMinutes, 1, 720);
        QuietHoursStart = Math.Clamp(QuietHoursStart, 0, 23);
        QuietHoursEnd = Math.Clamp(QuietHoursEnd, 0, 23);
        MaxSpeechChars = Math.Clamp(MaxSpeechChars, 8, 240);
        return this;
    }
}
