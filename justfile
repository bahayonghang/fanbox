set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

default:
    @just --list

[windows]
dev:
    @chcp.com 65001 > $null; [Console]::InputEncoding = [Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); $OutputEncoding = [System.Text.UTF8Encoding]::new($false); npm run app

[macos]
dev:
    npm run app

check:
    @npm --silent run check:vendor-patch
    @node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"

test: check
    @npm --silent run test:platform

[windows]
build: build-win

[macos]
build: build-mac

build-mac:
    @echo "[fanbox] Packaging macOS app..."
    @npm --silent run dist

build-win:
    @echo "[fanbox] Rebuilding native node-pty module..."
    @npm --silent run rebuild
    @echo "[fanbox] Packaging Windows app..."
    @npm --silent run dist:win

[windows]
install: build-win
    @chcp.com 65001 > $null; $ErrorActionPreference = 'Stop'; $installer = Get-ChildItem -Path 'dist' -Filter '*.exe' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1; if (-not $installer) { throw 'No Windows installer found in dist/. Run just build-win first.' }; Write-Host "Installing $($installer.Name)"; Start-Process -FilePath $installer.FullName -Wait

ci: test build
