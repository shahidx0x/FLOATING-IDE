# FLIDE — Floating IDE

A lightweight code editor that floats over every other app (browsers, docs, games in Windowed Fullscreen).
FLIDE is a fork of [Code - OSS](https://github.com/microsoft/vscode) (VS Code 1.141.0, MIT licence) with its own UI.

## What's different from VS Code

- **One bar, then code:** ☰ menu · file name · 🧩 extensions · ▶ Run/Stop · terminal · ○ bubble · ×
- **Always on top**, adjustable opacity, a **topmost guard** that keeps FLIDE above games (no injection, anti-cheat safe)
- **Bubble mode** (`Ctrl+Shift+M`): shrink to a round `{}` orb at the screen edge
- **Global show/hide** from anywhere: `Ctrl+Shift+Space` · Ghost (see-through, click-through): `Ctrl+Alt+G`
- **Menu** (☰): file tree, new file / folder, search & replace in files, right-click = VS Code's Explorer menu
  · `Ctrl+B` keeps it open beside the editor · `Ctrl+P` go to file · `Ctrl+Shift+F` search in files
- **Run / Stop** (`F5`): runs the open file with the command for its type (Python, Node, C/C++, Go, Rust, Java, PowerShell…)
- **Extensions** (`Ctrl+Shift+X`): dropdown with Installed / Browse (Open VSX) and a Manage view
- **Midnight** theme, Ubuntu Mono terminal font (bundled), tabs
- **`fld` command:** `fld .` opens the current folder, like `code .`

FLIDE's own code lives in `src/vs/workbench/contrib/flide/`, `src/vs/platform/windows/electron-main/flideFloating.ts`
and `extensions/theme-flide/`.

## Download

Every push to `main` builds Windows x64 on GitHub Actions (**Actions → Build FLIDE for Windows → Artifacts**):

- `FLIDE-Setup-x64-<version>.exe` — installer (per user, no admin rights needed)
- `FLIDE-win32-x64-<version>.zip` — portable, run `FLIDE.exe`

Pushing a tag like `v0.1.0` also attaches both files to a **GitHub Release**.

## Build locally (Windows)

Requirements: Node (version in `.nvmrc`), Python 3, Visual Studio 2022 Build Tools with
"Desktop development with C++" and the **Spectre-mitigated libs** component.

```powershell
npm ci
npm run watch            # incremental compile while developing
.\scripts\code.bat       # run the dev build

npm run gulp vscode-win32-x64-min          # full app  -> ..\VSCode-win32-x64\FLIDE.exe
npm run gulp vscode-win32-x64-inno-updater
npm run gulp vscode-win32-x64-user-setup   # installer -> .build\win32-x64\user-setup\
```

## Licence

FLIDE changes and Code - OSS are under the MIT licence — see [LICENSE.txt](LICENSE.txt).
Bundled fonts: Ubuntu Mono (Ubuntu Font Licence 1.0) and Symbols Nerd Font (MIT), see `src/vs/workbench/contrib/flide/electron-browser/media/fonts/`.
Extensions come from [Open VSX](https://open-vsx.org).
