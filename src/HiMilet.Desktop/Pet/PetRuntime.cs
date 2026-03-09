using LinePutScript;
using HiMilet.Desktop.Config;
using System.IO;
using VPet_Simulator.Core;

namespace HiMilet.Desktop.Pet;

public sealed class PetRuntime : IDisposable
{
    private Main? _main;
    private readonly GameCore _core = new();
    private bool _isFrozen;

    public event Action<string, string?>? UserEventRaised;

    public Main View => _main ?? throw new InvalidOperationException("Pet runtime is not initialized.");

    public void Initialize(FrontEndConfig config, IController controller)
    {
        var configPath = Path.GetFullPath(config.PetConfigPath);
        if (!File.Exists(configPath))
        {
            throw new FileNotFoundException($"Pet config file not found: {configPath}");
        }

        var petRoot = new DirectoryInfo(Path.GetDirectoryName(configPath)!);
        var lps = new LpsDocument(File.ReadAllText(configPath));
        var loader = new PetLoader(lps, petRoot);

        _core.Controller = controller;
        _core.Save = new GameSave(loader.PetName ?? "Milet");
        _core.Graph = loader.Graph(config.RenderResolution, System.Windows.Application.Current.Dispatcher);

        _main = new Main(_core)
        {
            NoFunctionMOD = IGameSave.ModeType.Nomal,
        };

        _main.LoadALL();
        _main.SetLogicInterval(config.LogicIntervalMs);
        _main.SetMoveMode(AllowMove: true, smartMove: true, SmartMoveInterval: 20_000);

        _main.DefaultClickAction = () => UserEventRaised?.Invoke("click", "pet");
        _main.DefaultPressAction = () => UserEventRaised?.Invoke("press", "pet");
        _main.Event_TouchHead += () => UserEventRaised?.Invoke("touch", "head");
        _main.Event_TouchBody += () => UserEventRaised?.Invoke("touch", "body");

        _main.ToolBar.MenuConversationNew.Click += (_, _) => UserEventRaised?.Invoke("menu", "conversation-new");
        _main.ToolBar.MenuConversationHistory.Click += (_, _) => UserEventRaised?.Invoke("menu", "conversation-history");
    }

    public void Speak(string text, bool interrupt = false, string? expression = null)
    {
        if (_main is null)
        {
            return;
        }

        if (interrupt)
        {
            _main.CleanState();
        }

        _main.Say(text, expression);
    }

    public bool TryRunAction(string actionId)
    {
        if (_main is null || _isFrozen)
        {
            return false;
        }

        switch (actionId)
        {
            case "pet.idle":
                _main.DisplayToNomal();
                return true;
            case "pet.thinking":
                _main.DisplayIdel_StateONE();
                return true;
            case "pet.work":
                _main.DisplayIdel();
                return true;
            case "pet.sleep":
                _main.DisplaySleep(force: true);
                return true;
            case "pet.approval":
                _main.DisplayTouchHead();
                return true;
            case "pet.touch.head":
                _main.DisplayTouchHead();
                return true;
            case "pet.touch.body":
                _main.DisplayTouchBody();
                return true;
            default:
                return false;
        }
    }

    public void SetFrozen(bool value)
    {
        if (_main is null)
        {
            return;
        }

        _isFrozen = value;
        _main.EventTimer.Enabled = !_isFrozen;

        if (_isFrozen)
        {
            _main.CleanState();
            _main.DisplayToNomal();
        }
    }

    public void Dispose()
    {
        _main?.Dispose();
    }
}
