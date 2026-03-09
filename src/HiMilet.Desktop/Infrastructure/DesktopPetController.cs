using System.Drawing;
using HiMilet.Desktop.Config;
using System.Windows;
using VPet_Simulator.Core;

namespace HiMilet.Desktop.Infrastructure;

public sealed class DesktopPetController : IController
{
    private readonly MainWindow _window;
    private readonly FrontEndConfig _config;

    public DesktopPetController(MainWindow window, FrontEndConfig config)
    {
        _window = window;
        _config = config;
    }

    public void MoveWindows(double x, double y)
    {
        _window.Dispatcher.Invoke(() =>
        {
            _window.Left += x * ZoomRatio;
            _window.Top += y * ZoomRatio;
        });
    }

    public double GetWindowsDistanceLeft() => _window.Dispatcher.Invoke(() => _window.Left);

    public double GetWindowsDistanceRight() => _window.Dispatcher.Invoke(
        () => SystemParameters.PrimaryScreenWidth - _window.Left - _window.ActualWidth);

    public double GetWindowsDistanceUp() => _window.Dispatcher.Invoke(() => _window.Top);

    public double GetWindowsDistanceDown() => _window.Dispatcher.Invoke(
        () => SystemParameters.PrimaryScreenHeight - _window.Top - _window.ActualHeight);

    public double ZoomRatio => _config.ZoomRatio;

    public int PressLength => _config.PressLengthMs;

    public void ShowPanel()
    {
        _window.Dispatcher.Invoke(() => _window.ShowStatus("Panel action is not implemented in MVP."));
    }

    public void ResetPosition()
    {
        _window.Dispatcher.Invoke(() =>
        {
            _window.Left = (SystemParameters.PrimaryScreenWidth - _window.ActualWidth) / 2;
            _window.Top = (SystemParameters.PrimaryScreenHeight - _window.ActualHeight) / 2;
        });
    }

    public bool CheckPosition()
    {
        return _window.Dispatcher.Invoke(() =>
            _window.Left < 0 ||
            _window.Top < 0 ||
            _window.Left + _window.ActualWidth > SystemParameters.PrimaryScreenWidth ||
            _window.Top + _window.ActualHeight > SystemParameters.PrimaryScreenHeight);
    }

    public bool EnableFunction => _config.EnableFunction;

    public int InteractionCycle => _config.InteractionCycle;

    public bool RePostionActive { get; set; } = true;

    public Rectangle ScreenBorder
    {
        get => new(0, 0, (int)SystemParameters.PrimaryScreenWidth, (int)SystemParameters.PrimaryScreenHeight);
        set { }
    }

    public bool IsPrimaryScreen => true;

    public void ResetScreenBorder()
    {
    }
}
