using System.Net.Http;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace HiMilet.Desktop.Config;

public sealed class ClientSettingsSyncService : IDisposable
{
    private readonly HttpClient _httpClient = new();
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        PropertyNameCaseInsensitive = true,
    };

    public async Task<FrontEndConfig?> TryLoadFromBackendAsync(Uri backendBaseUrl, CancellationToken cancellationToken = default)
    {
        var endpoint = new Uri(backendBaseUrl, "/api/settings/client");
        using var response = await _httpClient.GetAsync(endpoint, cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            return null;
        }

        var payload = await response.Content.ReadFromJsonAsync<ClientSettingsEnvelope>(JsonOptions, cancellationToken);
        var settings = payload?.Settings;
        settings?.Normalize();
        return settings;
    }

    public async Task<bool> SaveToBackendAsync(Uri backendBaseUrl, FrontEndConfig config, CancellationToken cancellationToken = default)
    {
        config.UpdatedAt = DateTimeOffset.UtcNow;
        config.Normalize();
        var endpoint = new Uri(backendBaseUrl, "/api/settings/client");
        using var response = await _httpClient.PutAsJsonAsync(endpoint, config, JsonOptions, cancellationToken);
        return response.IsSuccessStatusCode;
    }

    public async Task<bool> SetActiveProfileAsync(Uri backendBaseUrl, string profileId, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(profileId))
        {
            return false;
        }

        var endpoint = new Uri(backendBaseUrl, "/api/settings/llm/active-profile");
        var body = JsonSerializer.Serialize(new { id = profileId.Trim() });
        using var response = await _httpClient.PostAsync(
            endpoint,
            new StringContent(body, Encoding.UTF8, "application/json"),
            cancellationToken);
        return response.IsSuccessStatusCode;
    }

    public async Task<bool> SetProfileSecretAsync(Uri backendBaseUrl, string profileId, string apiKey, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(profileId) || string.IsNullOrWhiteSpace(apiKey))
        {
            return false;
        }

        var endpoint = new Uri(backendBaseUrl, $"/api/settings/llm/profiles/{profileId.Trim()}/secret");
        var body = JsonSerializer.Serialize(new { api_key = apiKey.Trim() });
        using var response = await _httpClient.PostAsync(
            endpoint,
            new StringContent(body, Encoding.UTF8, "application/json"),
            cancellationToken);
        return response.IsSuccessStatusCode;
    }

    public void Dispose()
    {
        _httpClient.Dispose();
    }

    private sealed class ClientSettingsEnvelope
    {
        public FrontEndConfig? Settings { get; init; }
    }
}
