using System.Windows;
using HiMilet.Protocol.Contracts;

namespace HiMilet.Desktop.UI;

public partial class ApprovalDialog : Window
{
    public string Decision { get; private set; } = "deny";

    public ApprovalDialog(ApprovalRequestPayload payload)
    {
        InitializeComponent();
        RequestText.Text =
            $"request_id: {payload.RequestId}\n" +
            $"risk_level: {payload.RiskLevel}\n" +
            $"timeout_ms: {payload.TimeoutMs}\n\n" +
            $"reason:\n{payload.Reason}\n\n" +
            $"command:\n{payload.Command}";
    }

    private void Allow_Click(object sender, RoutedEventArgs e)
    {
        Decision = "allow";
        DialogResult = true;
        Close();
    }

    private void Deny_Click(object sender, RoutedEventArgs e)
    {
        Decision = "deny";
        DialogResult = false;
        Close();
    }
}
