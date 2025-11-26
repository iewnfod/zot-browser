set windows-shell := ["powershell.exe", "-c"]

@default:
    just --list

@dev:
    concurrently "pnpm dev" "go run backend/main.go"
