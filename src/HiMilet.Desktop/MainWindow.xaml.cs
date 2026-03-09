using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using HiMilet.Adapters.OpenClaw;
using HiMilet.Desktop.Config;
using HiMilet.Desktop.Infrastructure;
using HiMilet.Desktop.Infrastructure.Ws;
using HiMilet.Desktop.Pet;
using HiMilet.Desktop.Skills;
using HiMilet.Desktop.UI;
using HiMilet.Protocol.Contracts;
using HiMilet.Protocol.Correlation;
using HiMilet.Protocol.Validation;

namespace HiMilet.Desktop;

public partial class MainWindow : Window
{
    private static readonly Brush UserBubbleBackground = new SolidColorBrush(Color.FromRgb(46, 83, 150));
    private static readonly Brush AssistantBubbleBackground = new SolidColorBrush(Color.FromRgb(38, 38, 38));
    private static readonly Brush UserTextForeground = Brushes.White;
    private static readonly Brush AssistantTextForeground = new SolidColorBrush(Color.FromRgb(232, 232, 232));

    private readonly FrontEndConfig _config = new();
    private readonly ApprovalTracker _approvalTracker = new();
    private readonly OpenClawGatewayAdapter _openClawAdapter = new();
    private readonly ISkillInvoker _skillInvoker = new NoopSkillInvoker();

    private readonly ObservableCollection<ChatMessageItem> _chatMessages = [];
    private readonly ObservableCollection<ChatMessageItem> _allChatMessages = [];
    private readonly Dictionary<string, ChatMessageItem> _assistantMessagesById = new(StringComparer.Ordinal);
    private string _conversationId = Guid.NewGuid().ToString("N");

    private DesktopPetController? _controller;
    private PetRuntime? _runtime;
    private ActionMapper? _actionMapper;
    private NeutralWsClient? _wsClient;

    private bool _isHitThrough;

    static MainWindow()
    {
        if (UserBubbleBackground is SolidColorBrush userBrush)
        {
            userBrush.Freeze();
        }

        if (AssistantBubbleBackground is SolidColorBrush assistantBrush)
        {
            assistantBrush.Freeze();
        }
    }

    public MainWindow()
    {
        InitializeComponent();
        ChatItems.ItemsSource = _chatMessages;
    }

    private async void Window_Loaded(object sender, RoutedEventArgs e)
    {
        try
        {
            InitializePetRuntime();
        }
        catch (Exception ex)
        {
            ShowStatus($"startup failed: {ex.Message}");
            return;
        }

        try
        {
            await ConnectGatewayAsync();
        }
        catch (Exception ex)
        {
            ShowStatus($"gateway offline: {ex.Message}");
            SetChatConnectionState("chat offline");
        }
    }

    private void InitializePetRuntime()
    {
        _controller = new DesktopPetController(this, _config);
        _runtime = new PetRuntime();
        _runtime.Initialize(_config, _controller);
        _runtime.UserEventRaised += Runtime_UserEventRaised;

        _actionMapper = new ActionMapper(_runtime);
        PetHost.Child = _runtime.View;

        ShowStatus("pet runtime ready");
    }

    private async Task ConnectGatewayAsync()
    {
        if (_wsClient is not null)
        {
            await _wsClient.DisposeAsync();
        }

        _wsClient = new NeutralWsClient(_config.GatewayUrl);
        _wsClient.ConnectionStateChanged += WsClient_ConnectionStateChanged;
        _wsClient.EnvelopeReceived += WsClient_EnvelopeReceived;
        _wsClient.RawMessageReceived += WsClient_RawMessageReceived;

        ShowStatus($"connecting {_config.GatewayUrl}");
        SetChatConnectionState("connecting...");
        await _wsClient.ConnectAsync();
        await SendClientStatusAsync("ready", "desktop online");
    }

    private async void WsClient_EnvelopeReceived(WsEnvelope envelope)
    {
        try
        {
            await Dispatcher.InvokeAsync(() => HandleInboundEnvelopeAsync(envelope)).Task.Unwrap();
        }
        catch (Exception ex)
        {
            ShowStatus($"envelope error: {ex.Message}");
        }
    }

    private async void WsClient_RawMessageReceived(string raw)
    {
        if (EnvelopeJson.TryDeserialize(raw, out _, out _))
        {
            return;
        }

        if (!_config.UseOpenClawAdapter)
        {
            return;
        }

        IEnumerable<WsEnvelope<object>> adapted;
        try
        {
            adapted = _openClawAdapter.AdaptInbound(raw, _config.SessionId).ToArray();
        }
        catch
        {
            return;
        }

        foreach (var envelope in adapted)
        {
            try
            {
                var payloadElement = JsonSerializer.SerializeToElement(envelope.Payload, EnvelopeJson.JsonOptions);
                var neutralEnvelope = new WsEnvelope(
                    envelope.Type,
                    envelope.SessionId,
                    envelope.TraceId,
                    payloadElement,
                    envelope.Timestamp);
                await Dispatcher.InvokeAsync(() => HandleInboundEnvelopeAsync(neutralEnvelope)).Task.Unwrap();
            }
            catch (Exception ex)
            {
                ShowStatus($"inbound adapt error: {ex.Message}");
            }
        }
    }

    private async Task HandleInboundEnvelopeAsync(WsEnvelope envelope)
    {
        switch (envelope.Type)
        {
            case EnvelopeTypes.PetAction:
            {
                var payload = EnvelopeJson.DeserializePayload<PetActionPayload>(envelope);
                if (payload is not null)
                {
                    _actionMapper?.ApplyActionId(payload.ActionId);
                }

                break;
            }
            case EnvelopeTypes.PetSpeak:
            {
                var payload = EnvelopeJson.DeserializePayload<PetSpeakPayload>(envelope);
                if (payload is not null)
                {
                    _runtime?.Speak(payload.Text, payload.Interrupt, payload.Expression);
                }

                break;
            }
            case EnvelopeTypes.PetState:
            {
                var payload = EnvelopeJson.DeserializePayload<PetStatePayload>(envelope);
                if (payload is not null)
                {
                    _actionMapper?.ApplyState(payload.State);
                }

                break;
            }
            case EnvelopeTypes.ChatAssistant:
            {
                var payload = EnvelopeJson.DeserializePayload<ChatAssistantPayload>(envelope);
                if (payload is not null)
                {
                    ApplyAssistantMessage(payload);
                }

                break;
            }
            case EnvelopeTypes.ApprovalRequest:
            {
                var payload = EnvelopeJson.DeserializePayload<ApprovalRequestPayload>(envelope);
                if (payload is not null)
                {
                    await HandleApprovalRequestAsync(payload, envelope.SessionId, envelope.TraceId);
                }

                break;
            }
            case EnvelopeTypes.SkillInvoke:
            {
                var payload = EnvelopeJson.DeserializePayload<SkillInvokePayload>(envelope);
                if (payload is not null)
                {
                    await HandleSkillInvokeAsync(payload);
                }

                break;
            }
            case EnvelopeTypes.SystemNotice:
            {
                var payload = EnvelopeJson.DeserializePayload<SystemNoticePayload>(envelope);
                if (payload is not null)
                {
                    ShowStatus(payload.Message);
                    AddAssistantSystemMessage(payload.Message);
                }

                break;
            }
            default:
                ShowStatus($"unknown inbound type: {envelope.Type}");
                break;
        }
    }

    private async Task HandleApprovalRequestAsync(ApprovalRequestPayload payload, string sessionId, string traceId)
    {
        if (_runtime is null)
        {
            return;
        }

        _approvalTracker.Track(payload, sessionId, traceId, DateTimeOffset.UtcNow);
        _runtime.SetFrozen(true);
        _actionMapper?.ApplyActionId("pet.approval");

        var dialog = new ApprovalDialog(payload)
        {
            Owner = this,
        };

        _ = dialog.ShowDialog();
        var decision = dialog.Decision;

        _runtime.SetFrozen(false);

        var result = new ApprovalResultPayload(payload.RequestId, decision);
        _approvalTracker.TryResolve(result, out _);
        await SendEnvelopeAsync(EnvelopeTypes.ApprovalResult, result);
        ShowStatus($"approval {decision}: {payload.RequestId}");
    }

    private async Task HandleSkillInvokeAsync(SkillInvokePayload payload)
    {
        var result = await _skillInvoker.InvokeAsync(payload);
        await SendEnvelopeAsync(EnvelopeTypes.SkillResult, result);
        ShowStatus($"skill {payload.Skill}: {result.Status}");
    }

    private void ApplyAssistantMessage(ChatAssistantPayload payload)
    {
        if (!_assistantMessagesById.TryGetValue(payload.MessageId, out var item))
        {
            item = new ChatMessageItem(
                payload.ConversationId,
                payload.MessageId,
                "assistant",
                payload.StreamId,
                AssistantBubbleBackground,
                AssistantTextForeground,
                HorizontalAlignment.Left);
            _assistantMessagesById[payload.MessageId] = item;
            _chatMessages.Add(item);
            _allChatMessages.Add(item);
        }

        if (payload.Seq <= item.Seq)
        {
            return;
        }

        item.Seq = payload.Seq;
        item.StreamId = payload.StreamId;
        item.Text += payload.Text;

        if (payload.IsFinal)
        {
            item.IsFinal = true;
            item.IsInterrupted = payload.Interrupted == true;
            if (!item.IsInterrupted)
            {
                _actionMapper?.ApplyState("Idle");
            }
        }

        ChatItems.ScrollIntoView(item);
    }

    private void AddAssistantSystemMessage(string message)
    {
        var item = new ChatMessageItem(
            _conversationId,
            Guid.NewGuid().ToString("N"),
            "assistant",
            Guid.NewGuid().ToString("N"),
            AssistantBubbleBackground,
            AssistantTextForeground,
            HorizontalAlignment.Left)
        {
            Text = message,
            IsFinal = true,
        };
        _chatMessages.Add(item);
        _allChatMessages.Add(item);
        ChatItems.ScrollIntoView(item);
    }

    private async void Runtime_UserEventRaised(string @event, string? target)
    {
        if (@event == "menu")
        {
            if (target == "conversation-new")
            {
                Dispatcher.Invoke(() =>
                {
                    _conversationId = Guid.NewGuid().ToString("N");
                    _chatMessages.Clear();
                    _allChatMessages.Clear();
                    _assistantMessagesById.Clear();
                });
                return;
            }

            if (target == "conversation-history")
            {
                Dispatcher.Invoke(() =>
                {
                    var window = new HistoryWindow(_allChatMessages) { Owner = this };
                    window.Show();
                });
                return;
            }
        }

        try
        {
            await SendEnvelopeAsync(EnvelopeTypes.UserEvent, new UserEventPayload(@event, target));
        }
        catch (Exception ex)
        {
            ShowStatus($"event send failed: {ex.Message}");
        }
    }

    private async Task SendClientStatusAsync(string status, string detail)
    {
        await SendEnvelopeAsync(EnvelopeTypes.ClientStatus, new ClientStatusPayload(status, detail));
    }

    private async Task SendEnvelopeAsync<TPayload>(string type, TPayload payload)
    {
        if (_wsClient is null)
        {
            return;
        }

        if (!_wsClient.IsConnected)
        {
            return;
        }

        var envelope = new WsEnvelope<TPayload>(
            type,
            _config.SessionId,
            Guid.NewGuid().ToString("N"),
            payload,
            DateTimeOffset.UtcNow);

        if (_config.UseOpenClawAdapter)
        {
            var payloadElement = JsonSerializer.SerializeToElement(payload, EnvelopeJson.JsonOptions);
            var neutral = new WsEnvelope(type, envelope.SessionId, envelope.TraceId, payloadElement, envelope.Timestamp);
            var adaptedOutbound = _openClawAdapter.AdaptOutbound(neutral);
            var raw = JsonSerializer.Serialize(adaptedOutbound, EnvelopeJson.JsonOptions);
            await _wsClient.SendRawAsync(raw);
            return;
        }

        await _wsClient.SendAsync(envelope);
    }

    private async void WsClient_ConnectionStateChanged(string status)
    {
        await Dispatcher.InvokeAsync(() =>
        {
            ShowStatus(status);
            SetChatConnectionState(status == "connected" ? "chat online" : $"chat {status}");

            if (status == "closed")
            {
                MarkStreamingMessagesInterrupted();
                _actionMapper?.ApplyState("Idle");
            }
        });
    }

    private void MarkStreamingMessagesInterrupted()
    {
        foreach (var msg in _assistantMessagesById.Values.Where(m => !m.IsFinal))
        {
            msg.IsFinal = true;
            msg.IsInterrupted = true;
        }
    }

    private void SetChatConnectionState(string text)
    {
        ChatConnectionText.Text = text;
    }

    private async void Reconnect_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            await ConnectGatewayAsync();
        }
        catch (Exception ex)
        {
            ShowStatus($"reconnect failed: {ex.Message}");
        }
    }

    private void Topmost_Click(object sender, RoutedEventArgs e)
    {
        Topmost = !Topmost;
        ShowStatus(Topmost ? "topmost enabled" : "topmost disabled");
        Runtime_UserEventRaised("menu", "toggle-topmost");
    }

    private void HitThrough_Click(object sender, RoutedEventArgs e)
    {
        _isHitThrough = !_isHitThrough;
        Win32.SetClickThrough(this, _isHitThrough);
        ShowStatus(_isHitThrough ? "hit-through enabled" : "hit-through disabled");
        Runtime_UserEventRaised("menu", "toggle-hit-through");
    }

    private void PetHost_PreviewMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (_isHitThrough)
        {
            return;
        }

        Runtime_UserEventRaised("click", "pet");
        try
        {
            DragMove();
        }
        catch
        {
            // DragMove throws if called in invalid mouse state.
        }
    }

    private void PetHost_PreviewMouseLeftButtonUp(object sender, MouseButtonEventArgs e)
    {
        Runtime_UserEventRaised("drag", "pet");
    }

    private void Window_PreviewMouseRightButtonDown(object sender, MouseButtonEventArgs e)
    {
        Runtime_UserEventRaised("menu", "window");
    }

    private async void SendChat_Click(object sender, RoutedEventArgs e)
    {
        await SendChatAsync();
    }

    private async Task SendChatAsync()
    {
        var text = ChatInput.Text.Trim();
        if (string.IsNullOrWhiteSpace(text))
        {
            return;
        }

        var messageId = Guid.NewGuid().ToString("N");
        var item = new ChatMessageItem(
            _conversationId,
            messageId,
            "user",
            string.Empty,
            UserBubbleBackground,
            UserTextForeground,
            HorizontalAlignment.Right)
        {
            Text = text,
            IsFinal = true,
        };

        _chatMessages.Clear();
        _chatMessages.Add(item);
        _allChatMessages.Add(item);
        ChatItems.ScrollIntoView(item);
        ChatInput.Text = string.Empty;

        await SendEnvelopeAsync(EnvelopeTypes.ChatUser, new ChatUserPayload(_conversationId, messageId, text));
        _actionMapper?.ApplyState("Thinking");
    }

    private async void ContinueMessage_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button btn || btn.Tag is not string messageId)
        {
            return;
        }

        if (!_assistantMessagesById.TryGetValue(messageId, out var msg) || !msg.IsInterrupted)
        {
            return;
        }

        msg.IsInterrupted = false;
        msg.IsFinal = false;
        await SendEnvelopeAsync(EnvelopeTypes.ChatContinue, new ChatContinuePayload(msg.ConversationId, msg.MessageId));
        _actionMapper?.ApplyState("Thinking");
    }

    private async void ChatInput_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Enter && Keyboard.Modifiers != ModifierKeys.Shift)
        {
            e.Handled = true;
            await SendChatAsync();
        }
    }

    private async void Window_Closed(object? sender, EventArgs e)
    {
        if (_wsClient is not null)
        {
            await _wsClient.DisposeAsync();
        }

        _runtime?.Dispose();
    }

    public void ShowStatus(string message)
    {
        StatusText.Text = message;
    }
}

public sealed class ChatMessageItem : INotifyPropertyChanged
{
    private string _text = string.Empty;
    private bool _isFinal;
    private bool _isInterrupted;
    private int _seq = -1;
    private string _streamId;

    public ChatMessageItem(
        string conversationId,
        string messageId,
        string role,
        string streamId,
        Brush bubbleBackground,
        Brush textForeground,
        HorizontalAlignment alignment)
    {
        ConversationId = conversationId;
        MessageId = messageId;
        Role = role;
        _streamId = streamId;
        BubbleBackground = bubbleBackground;
        TextForeground = textForeground;
        Alignment = alignment;
    }

    public string ConversationId { get; }
    public string MessageId { get; }
    public string Role { get; }

    public int Seq
    {
        get => _seq;
        set => SetField(ref _seq, value);
    }

    public string StreamId
    {
        get => _streamId;
        set => SetField(ref _streamId, value);
    }

    public string Text
    {
        get => _text;
        set => SetField(ref _text, value);
    }

    public bool IsFinal
    {
        get => _isFinal;
        set => SetField(ref _isFinal, value);
    }

    public bool IsInterrupted
    {
        get => _isInterrupted;
        set
        {
            if (SetField(ref _isInterrupted, value))
            {
                OnPropertyChanged(nameof(ContinueVisibility));
            }
        }
    }

    public Brush BubbleBackground { get; }
    public Brush TextForeground { get; }
    public HorizontalAlignment Alignment { get; }
    public Visibility ContinueVisibility => IsInterrupted ? Visibility.Visible : Visibility.Collapsed;

    public event PropertyChangedEventHandler? PropertyChanged;

    private bool SetField<T>(ref T field, T value, [CallerMemberName] string? propertyName = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value))
        {
            return false;
        }

        field = value;
        OnPropertyChanged(propertyName);
        return true;
    }

    private void OnPropertyChanged([CallerMemberName] string? propertyName = null)
    {
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(propertyName));
    }
}
