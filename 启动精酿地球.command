#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd -- "$(dirname -- "$0")" && pwd -P)"
SERVER_PATH="$PROJECT_DIR/scripts/serve.mjs"
RUNTIME_DIR="$PROJECT_DIR/.runtime"
BREW_PORT="${PORT:-4173}"
NODE_BIN=""

finish_error() {
  printf '\n%s\n' "$1" >&2
  if [ -t 0 ]; then read -r -p '按回车关闭窗口……' _answer || true; fi
  exit 1
}

candidate="$(command -v node || true)"
if [ -n "$candidate" ] && "$candidate" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' >/dev/null 2>&1; then
  NODE_BIN="$candidate"
fi
if [ -z "$NODE_BIN" ]; then
  for candidate in "$HOME"/.nvm/versions/node/*/bin/node; do
    if [ -x "$candidate" ] && "$candidate" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' >/dev/null 2>&1; then NODE_BIN="$candidate"; fi
  done
fi
if [ -z "$NODE_BIN" ]; then
  candidate="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
  if [ -x "$candidate" ]; then NODE_BIN="$candidate"; fi
fi
[ -n "$NODE_BIN" ] || finish_error '找不到 Node.js 18 或更新版本。请安装 Node.js 后再双击启动。'
"$NODE_BIN" -e 'const p=Number(process.argv[1]); process.exit(Number.isInteger(p)&&p>0&&p<65536?0:1)' "$BREW_PORT" || finish_error 'PORT 必须是 1–65535 的整数。'
[ -f "$PROJECT_DIR/dist/index.html" ] || finish_error '缺少已构建的 dist 文件夹。请在项目目录执行 npm ci 和 npm run build，然后再次启动。'
mkdir -p "$RUNTIME_DIR"
PID_FILE="$RUNTIME_DIR/server-$BREW_PORT.pid"
NODE_FILE="$RUNTIME_DIR/server-$BREW_PORT.node"
LOG_FILE="$RUNTIME_DIR/server-$BREW_PORT.log"
LOCAL_URL="http://127.0.0.1:$BREW_PORT"

health_matches() {
  local health
  health="$(/usr/bin/curl --fail --silent --max-time 2 "$LOCAL_URL/__brew_atlas_health" 2>/dev/null)" || return 1
  printf '%s' "$health" | "$NODE_BIN" -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>{try{const x=JSON.parse(s);process.exit(x.app==="brew-atlas"&&x.project===process.argv[1]?0:1)}catch{process.exit(1)}})' "$PROJECT_DIR"
}

open_app() {
  printf '\n精酿地球：%s\n停止服务时，双击「停止精酿地球.command」。\n' "$LOCAL_URL"
  if [ "${BREW_ATLAS_NO_OPEN:-0}" != 1 ]; then /usr/bin/open "$LOCAL_URL"; fi
}

if health_matches; then
  printf '本项目服务已经运行。\n'
  open_app
  exit 0
fi

# Never stop an unrelated listener or start a second application on its behalf.
if /usr/bin/curl --silent --max-time 2 "$LOCAL_URL/" >/dev/null 2>&1; then
  finish_error "$BREW_PORT 端口已有其他服务，本次未修改它。可用 PORT=4174 指定另一端口。"
fi

printf '正在启动本地精酿地球……\n'
PORT="$BREW_PORT" nohup "$NODE_BIN" "$SERVER_PATH" >>"$LOG_FILE" 2>&1 </dev/null &
SERVER_PID=$!
printf '%s\n' "$SERVER_PID" >"$PID_FILE"
printf '%s\n' "$NODE_BIN" >"$NODE_FILE"

for attempt in {1..40}; do
  if health_matches; then open_app; exit 0; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then break; fi
  sleep 0.25
done
finish_error "服务未成功启动，请查看日志：$LOG_FILE"
