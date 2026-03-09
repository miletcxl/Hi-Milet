using System.Net.WebSockets;
using System.Text;
using HiMilet.Protocol.Contracts;
using HiMilet.Protocol.Validation;

namespace HiMilet.Desktop.Infrastructure.Ws;

public sealed class NeutralWsClient : IAsyncDisposable
{
    private readonly Uri _uri;
    private readonly ClientWebSocket _socket = new();
    private readonly CancellationTokenSource _cts = new();

    public event Action<WsEnvelope>? EnvelopeReceived;
    public event Action<string>? ConnectionStateChanged;
    public event Action<string>? RawMessageReceived;
    public bool IsConnected => _socket.State == WebSocketState.Open;

    public NeutralWsClient(Uri uri)
    {
        _uri = uri;
    }

    public async Task ConnectAsync(CancellationToken cancellationToken = default)
    {
        await _socket.ConnectAsync(_uri, cancellationToken);
        ConnectionStateChanged?.Invoke("connected");
        _ = Task.Run(() => ReceiveLoopAsync(_cts.Token));
    }

    public async Task SendAsync<TPayload>(WsEnvelope<TPayload> envelope, CancellationToken cancellationToken = default)
    {
        var json = EnvelopeJson.Serialize(envelope);
        await SendRawAsync(json, cancellationToken);
    }

    public async Task SendRawAsync(string json, CancellationToken cancellationToken = default)
    {
        var data = Encoding.UTF8.GetBytes(json);
        await _socket.SendAsync(data, WebSocketMessageType.Text, true, cancellationToken);
    }

    private async Task ReceiveLoopAsync(CancellationToken cancellationToken)
    {
        var buffer = new byte[64 * 1024];
        var builder = new StringBuilder();

        try
        {
            while (!cancellationToken.IsCancellationRequested && _socket.State == WebSocketState.Open)
            {
                WebSocketReceiveResult result;
                do
                {
                    result = await _socket.ReceiveAsync(buffer, cancellationToken);
                    if (result.MessageType == WebSocketMessageType.Close)
                    {
                        ConnectionStateChanged?.Invoke("closed");
                        return;
                    }

                    builder.Append(Encoding.UTF8.GetString(buffer, 0, result.Count));
                } while (!result.EndOfMessage);

                var text = builder.ToString();
                builder.Clear();
                RawMessageReceived?.Invoke(text);

                if (!EnvelopeJson.TryDeserialize(text, out var envelope, out _))
                {
                    continue;
                }

                EnvelopeReceived?.Invoke(envelope!);
            }
        }
        catch (OperationCanceledException)
        {
            // Normal shutdown path.
        }
        catch (ObjectDisposedException)
        {
            // Socket disposed during shutdown.
        }
        catch (WebSocketException)
        {
            ConnectionStateChanged?.Invoke("closed");
        }
    }

    public async ValueTask DisposeAsync()
    {
        _cts.Cancel();
        if (_socket.State == WebSocketState.Open)
        {
            await _socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "shutdown", CancellationToken.None);
        }

        _socket.Dispose();
        _cts.Dispose();
    }
}
