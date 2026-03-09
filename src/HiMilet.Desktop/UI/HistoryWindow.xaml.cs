using System.Collections.ObjectModel;
using System.Windows;

namespace HiMilet.Desktop.UI;

public partial class HistoryWindow : Window
{
    public HistoryWindow(ObservableCollection<ChatMessageItem> historyMessages)
    {
        InitializeComponent();
        HistoryItems.ItemsSource = historyMessages;
    }
}
