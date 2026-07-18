using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;

[assembly: AssemblyTitle("MindFlow")]
[assembly: AssemblyDescription("MindFlow Windows portable launcher")]
[assembly: AssemblyCompany("MindFlow")]
[assembly: AssemblyProduct("MindFlow")]
[assembly: AssemblyVersion("1.6.1.0")]
[assembly: AssemblyFileVersion("1.6.1.0")]

internal static class MindFlowLauncher
{
    [STAThread]
    private static void Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string appDirectory = Path.Combine(root, "app");
        string executable = Path.Combine(appDirectory, "MindFlow.exe");

        if (!File.Exists(executable))
        {
            MessageBox.Show(
                "没有找到 MindFlow 运行文件。\n\n请先完整解压 ZIP，再双击根目录里的 MindFlow.exe。\n不要单独移动或复制这个启动程序。",
                "MindFlow 无法启动",
                MessageBoxButtons.OK,
                MessageBoxIcon.Information
            );
            return;
        }

        try
        {
            Process.Start(new ProcessStartInfo
            {
                FileName = executable,
                WorkingDirectory = appDirectory,
                UseShellExecute = true
            });
        }
        catch (Exception error)
        {
            MessageBox.Show(
                "MindFlow 启动失败。\n\n" + error.Message,
                "MindFlow 无法启动",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }
}
