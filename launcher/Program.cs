using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

// masmorra.exe — abre a Masmorra do Carrasco sem linha de comando.
//
// Fluxo: acha a raiz do jogo, ve se o jogo ja' esta' no ar (pela /__saude do
// server.js), sobe o servidor se nao estiver, espera ele responder e abre o
// jogo numa janela de app (Edge/Chrome sem barra de endereco).
//
// O servidor roda PRESO a este terminal: o log dele aparece aqui, e fechar a
// janela (ou Ctrl+C) o derruba. Um Job Object com KILL_ON_JOB_CLOSE garante
// isso mesmo se o launcher for morto a forca — sem ele, o Node ficaria de pe'
// sozinho e invisivel, segurando a porta.
//
// Copia enxuta do launcher do editor de cenas (Documents/projects/
// trhee_js_scene_editor/launcher), que tem o mesmo desenho e mais historia.

namespace Masmorra;

internal static class Program
{
    const int PortaBase = 5173;           // a do server.js (process.env.PORT || 5173)
    const int PortasParaTentar = 10;
    const string Identidade = "masmorra-do-carrasco";   // a `quem` da /__saude

    static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(3) };
    static IntPtr _job;   // estatico: coletado, o Windows fecharia o job e mataria o jogo

    static int Main(string[] args)
    {
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        Console.Title = "Masmorra do Carrasco";
        Escrever(ConsoleColor.DarkYellow, "\n  ####  MASMORRA DO CARRASCO  ####\n");
        bool semJanela = Tem(args, "--no-browser");

        string raiz = AcharRaiz();
        if (raiz == null)
        {
            Erro("nao achei a pasta do jogo (procurei package.json + server.js + js/main.js).");
            Console.WriteLine("  Deixe o masmorra.exe dentro da pasta do jogo.");
            return Segurar(2);
        }
        Info($"jogo: {raiz}");

        // ---- 1. o servidor ------------------------------------------------
        Passo(1, "servidor do jogo");
        Process nosso = null;
        int porta = ProcurarNosso();
        if (porta > 0)
        {
            Ok($"ja estava no ar na porta {porta}");
            Aviso("ele foi subido por fora deste terminal — fechar esta janela NAO o desliga");
        }
        else
        {
            if (!TemNode())
            {
                Erro("o Node nao esta instalado (ou nao esta no PATH).");
                Console.WriteLine("  Baixe em https://nodejs.org e rode o masmorra.exe de novo.");
                return Segurar(3);
            }
            // O server.js NAO anda de porta sozinho: com a 5173 ocupada (e' a
            // porta padrao do Vite) ele cairia com EADDRINUSE. Quem escolhe uma
            // livre e' o launcher, e passa pela variavel PORT que ele ja' le'.
            porta = PortaLivre();
            if (porta <= 0)
            {
                Erro($"as portas {PortaBase}-{PortaBase + PortasParaTentar - 1} estao todas ocupadas por outros programas.");
                return Segurar(4);
            }
            if (porta != PortaBase) Aviso($"a porta {PortaBase} esta' ocupada por outro programa; usando a {porta}");

            try { nosso = Subir(raiz, porta); }
            catch (Exception e) { Erro($"nao consegui iniciar o servidor: {e.Message}"); return Segurar(3); }

            if (!EsperarSubir(nosso, porta, 20))
            {
                try { nosso.Kill(entireProcessTree: true); } catch { }
                return Segurar(4);
            }
        }

        string url = $"http://localhost:{porta}/";

        // ---- 2. a janela --------------------------------------------------
        if (!semJanela)
        {
            Passo(2, "abrindo o jogo");
            try { AbrirComoApp(url); Ok("janela aberta"); }
            catch (Exception e) { Aviso($"nao consegui abrir a janela: {e.Message}"); Console.WriteLine($"  Abra na mao: {url}"); }
        }

        if (nosso == null) { Console.WriteLine($"\n  jogo em {url}"); Thread.Sleep(2500); return 0; }

        // ---- 3. segurar o terminal enquanto o jogo vive -------------------
        Console.WriteLine();
        Ok($"jogo em {url}");
        Escrever(ConsoleColor.Yellow, "  FECHE ESTA JANELA (ou Ctrl+C) PARA DESLIGAR O SERVIDOR DO JOGO");
        Console.WriteLine("\n\n  log do servidor:");
        nosso.WaitForExit();
        Console.WriteLine();
        if (nosso.ExitCode == 0) { Ok("o servidor foi desligado."); Thread.Sleep(1200); return 0; }
        Erro($"o servidor encerrou com erro (codigo {nosso.ExitCode}) — o log dele esta' acima.");
        return Segurar(5);
    }

    // ------------------------------------------------------------ o servidor

    /// <summary>
    /// Ha' alguem ouvindo? Resposta em no maximo 300 ms: no Windows uma porta
    /// FECHADA leva ~2 s para recusar, e dez delas travariam a janela.
    /// </summary>
    static bool PortaAberta(int porta)
    {
        try
        {
            using var c = new System.Net.Sockets.TcpClient();
            var t = c.ConnectAsync("127.0.0.1", porta);
            return t.Wait(300) && c.Connected;
        }
        catch { return false; }
    }

    static string QuemEsta(int porta)
    {
        if (!PortaAberta(porta)) return null;
        try
        {
            using var res = Http.GetAsync($"http://127.0.0.1:{porta}/__saude").GetAwaiter().GetResult();
            if ((int)res.StatusCode != 200) return "";
            using var doc = JsonDocument.Parse(res.Content.ReadAsStringAsync().GetAwaiter().GetResult());
            return doc.RootElement.TryGetProperty("quem", out var q) ? q.GetString() : "";
        }
        catch { return ""; }   // aberta, mas nao responde como o jogo: e' de outro programa
    }

    static int ProcurarNosso()
    {
        for (int i = 0; i < PortasParaTentar; i++)
            if (QuemEsta(PortaBase + i) == Identidade) return PortaBase + i;
        return 0;
    }

    static int PortaLivre()
    {
        for (int i = 0; i < PortasParaTentar; i++)
            if (!PortaAberta(PortaBase + i)) return PortaBase + i;
        return 0;
    }

    static bool TemNode()
    {
        try
        {
            var p = Process.Start(new ProcessStartInfo("node", "--version")
            { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true });
            if (p == null) return false;
            p.WaitForExit(5000);
            return p.HasExited && p.ExitCode == 0;
        }
        catch { return false; }
    }

    /// <summary>Sobe o server.js como FILHO deste terminal, amarrado pelo Job.</summary>
    static Process Subir(string raiz, int porta)
    {
        Info($"iniciando: node server.js (porta {porta})");
        var psi = new ProcessStartInfo
        {
            FileName = "node",
            Arguments = "server.js",
            WorkingDirectory = raiz,
            UseShellExecute = false,   // herda ESTE console: log aqui, e fechar a janela o derruba
        };
        psi.Environment["PORT"] = porta.ToString();
        var p = Process.Start(psi) ?? throw new Exception("o Node nao iniciou");
        if (!Amarrar(p)) Aviso("nao consegui amarrar o servidor ao terminal; se este launcher for morto a forca, o Node pode ficar rodando");
        return p;
    }

    static bool EsperarSubir(Process p, int porta, int segundos)
    {
        Console.Write($"  aguardando a porta {porta} ");
        var sw = Stopwatch.StartNew();
        while (sw.Elapsed.TotalSeconds < segundos)
        {
            if (p.HasExited)
            {
                Console.WriteLine();
                Erro($"o servidor encerrou sozinho (codigo {p.ExitCode}) — o erro esta' acima.");
                return false;
            }
            Thread.Sleep(300);
            Console.Write(".");
            if (QuemEsta(porta) == Identidade)
            {
                Console.WriteLine();
                Ok($"no ar ({sw.Elapsed.TotalSeconds:0.0}s)");
                return true;
            }
        }
        Console.WriteLine();
        Erro($"o servidor nao respondeu em {segundos}s.");
        return false;
    }

    static bool Amarrar(Process p)
    {
        try
        {
            _job = Nativo.CreateJobObject(IntPtr.Zero, null);
            if (_job == IntPtr.Zero) return false;
            var info = new Nativo.JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            info.BasicLimitInformation.LimitFlags = Nativo.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            int tam = Marshal.SizeOf(info);
            IntPtr buf = Marshal.AllocHGlobal(tam);
            try
            {
                Marshal.StructureToPtr(info, buf, false);
                if (!Nativo.SetInformationJobObject(_job, Nativo.JobObjectExtendedLimitInformation, buf, (uint)tam)) return false;
            }
            finally { Marshal.FreeHGlobal(buf); }
            return Nativo.AssignProcessToJobObject(_job, p.Handle);
        }
        catch { return false; }
    }

    // ------------------------------------------------------------- a janela

    static readonly string[] Chromium =
    {
        @"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe",
        @"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe",
        @"%ProgramFiles%\Google\Chrome\Application\chrome.exe",
        @"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe",
    };

    /// <summary>Janela de APP (sem barra de endereco); sem Edge/Chrome, o navegador padrao.</summary>
    static void AbrirComoApp(string url)
    {
        string exe = Chromium.Select(Environment.ExpandEnvironmentVariables).FirstOrDefault(File.Exists);
        if (exe != null)
        {
            try
            {
                Process.Start(new ProcessStartInfo
                { FileName = exe, Arguments = $"--app=\"{url}\" --window-size=1600,900", UseShellExecute = false });
                return;
            }
            catch (Exception e) { Aviso($"nao consegui abrir o {Path.GetFileName(exe)} ({e.Message}); tentando o navegador padrao."); }
        }
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
    }

    // ------------------------------------------------------------------ util

    /// <summary>As TRES marcas juntas: package.json sozinho acharia qualquer projeto Node.</summary>
    static string AcharRaiz()
    {
        foreach (var inicio in new[] { AppContext.BaseDirectory, Directory.GetCurrentDirectory() })
        {
            for (var dir = new DirectoryInfo(inicio); dir != null; dir = dir.Parent)
            {
                if (File.Exists(Path.Combine(dir.FullName, "package.json")) &&
                    File.Exists(Path.Combine(dir.FullName, "server.js")) &&
                    File.Exists(Path.Combine(dir.FullName, "js", "main.js")))
                    return dir.FullName;
            }
        }
        return null;
    }

    static bool Tem(string[] a, string flag) =>
        Array.Exists(a, x => string.Equals(x, flag, StringComparison.OrdinalIgnoreCase));

    /// <summary>So' o PROBLEMA segura a janela: sucesso que espera tecla ensina a fechar sem ler.</summary>
    static int Segurar(int codigo)
    {
        Console.WriteLine("\n  (pressione qualquer tecla para fechar)");
        try { Console.ReadKey(true); } catch { Thread.Sleep(4000); }
        return codigo;
    }

    static void Passo(int n, string o_que) { Console.WriteLine(); Escrever(ConsoleColor.Cyan, $"[{n}] {o_que}"); Console.WriteLine(); }
    static void Ok(string m) { Escrever(ConsoleColor.Green, "  OK   "); Console.WriteLine(m); }
    static void Erro(string m) { Escrever(ConsoleColor.Red, "  ERRO "); Console.WriteLine(m); }
    static void Aviso(string m) { Escrever(ConsoleColor.Yellow, "  !    "); Console.WriteLine(m); }
    static void Info(string m) { Escrever(ConsoleColor.DarkGray, "  ·    " + m); Console.WriteLine(); }

    static void Escrever(ConsoleColor c, string s)
    {
        var antes = Console.ForegroundColor;
        Console.ForegroundColor = c;
        Console.Write(s);
        Console.ForegroundColor = antes;
    }

    /// <summary>O Job Object do Windows (kernel32).</summary>
    static class Nativo
    {
        public const int JobObjectExtendedLimitInformation = 9;
        public const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

        [StructLayout(LayoutKind.Sequential)]
        public struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass, SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct IO_COUNTERS
        {
            public ulong ReadOperationCount, WriteOperationCount, OtherOperationCount;
            public ulong ReadTransferCount, WriteTransferCount, OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern IntPtr CreateJobObject(IntPtr atributos, string nome);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool SetInformationJobObject(IntPtr job, int classe, IntPtr info, uint tamanho);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr processo);
    }
}
