set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

default:
    @just --list

check:
    npm run check:vendor-patch
    node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('package.json ok')"

test: check
    npm run test:platform

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
