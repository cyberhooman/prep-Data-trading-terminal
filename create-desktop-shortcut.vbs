Set WshShell = CreateObject("WScript.Shell")
DesktopPath = WshShell.SpecialFolders("Desktop")
Set oShellLink = WshShell.CreateShortcut(DesktopPath & "\Deploy Trading Dashboard.lnk")

' Get the current script directory
ScriptPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' Set shortcut properties
oShellLink.TargetPath = ScriptPath & "\quick-deploy.bat"
oShellLink.WindowStyle = 1
oShellLink.IconLocation = "C:\Windows\System32\imageres.dll,1"
oShellLink.Description = "Deploy Alphalabs Trading Dashboard to Vercel"
oShellLink.WorkingDirectory = ScriptPath
oShellLink.Save

MsgBox "Desktop shortcut created successfully!" & vbCrLf & vbCrLf & "Shortcut: " & DesktopPath & "\Deploy Trading Dashboard.lnk", vbInformation, "Shortcut Created"
