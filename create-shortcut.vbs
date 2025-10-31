Set WshShell = CreateObject("WScript.Shell")
DesktopPath = WshShell.SpecialFolders("Desktop")
Set oShellLink = WshShell.CreateShortcut(DesktopPath & "\Open Trading Dashboard.lnk")

' Get the current script directory
ScriptPath = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)

' Set shortcut properties
oShellLink.TargetPath = ScriptPath & "\open-app.bat"
oShellLink.WindowStyle = 1
oShellLink.IconLocation = "C:\Windows\System32\imageres.dll,277"
oShellLink.Description = "Open Trading Dashboard in Browser"
oShellLink.WorkingDirectory = ScriptPath
oShellLink.Save

MsgBox "Desktop shortcut created successfully!" & vbCrLf & vbCrLf & "Look for 'Open Trading Dashboard' on your desktop", vbInformation, "Success!"
