[Setup]
AppId=com.example.deepbot
AppName=DeepBot
AppVersion={#Version}
VersionInfoVersion={#Version}
VersionInfoProductVersion={#Version}
VersionInfoProductTextVersion={#Version}
DefaultDirName={localappdata}\Programs\DeepBot
PrivilegesRequired=lowest
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\DeepBot.exe
OutputBaseFilename={#SetupName}
Compression=lzma2
SolidCompression=yes

[Files]
Source: "{#AppDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\DeepBot"; Filename: "{app}\DeepBot.exe"
