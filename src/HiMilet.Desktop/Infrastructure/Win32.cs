using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace HiMilet.Desktop.Infrastructure;

public static class Win32
{
    private const int GwlExStyle = -20;
    private const int WsExTransparent = 0x20;

    [DllImport("user32.dll", EntryPoint = "GetWindowLong")]
    private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLong")]
    private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

    public static void SetClickThrough(Window window, bool enabled)
    {
        var hwnd = new WindowInteropHelper(window).EnsureHandle();
        var style = GetWindowLong(hwnd, GwlExStyle);
        if (enabled)
        {
            style |= WsExTransparent;
        }
        else
        {
            style &= ~WsExTransparent;
        }

        SetWindowLong(hwnd, GwlExStyle, style);
    }
}
