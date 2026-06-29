set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

default:
    @just --list

check:
    npm run check:vendor-patch
    node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"

test: check
    @echo "No automated test suite is configured yet; run just check for current gates."

[windows]
build: build-win

[macos]
build: build-mac

build-mac:
    npm run dist

build-win:
    npm run rebuild
    npm run dist:win

ci: test build
