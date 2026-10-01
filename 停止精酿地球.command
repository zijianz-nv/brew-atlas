#!/bin/bash
set -euo pipefail
PROJECT_DIR="$(cd -- "$(dirname -- "$0")" && pwd -P)"
SERVER_PATH="$PROJECT_DIR/scripts/serve.mjs"
BREW_PORT="${PORT:-4173}"
case "$BREW_PORT" in ''|*[!0-9]*) printf 'PORT 必须为整数。\n' >&2; exit 1;; esac
PID_FILE="$PROJECT_DIR/.runtime/server-$BREW_PORT.pid"
NODE_FILE="$PROJECT_DIR/.runtime/server-$BREW_PORT.node"

if [ ! -f "$PID_FILE" ] || [ ! -f "$NODE_FILE" ]; then
  printf '没有本启动器记录的服务，无需停止。\n'
  exit 0
fi
IFS= read -r SERVER_PID <"$PID_FILE"
IFS= read -r NODE_BIN <"$NODE_FILE"
case "$SERVER_PID" in ''|*[!0-9]*) printf 'PID 记录无效，未停止任何进程。\n' >&2; exit 1;; esac
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  rm -f -- "$PID_FILE" "$NODE_FILE"
  printf '服务已停止。\n'
  exit 0
fi
COMMAND_LINE="$(/bin/ps -p "$SERVER_PID" -o command= || true)"
if [ "$COMMAND_LINE" != "$NODE_BIN $SERVER_PATH" ]; then
  printf 'PID 对应的命令不是本项目服务器，未停止该进程。\n' >&2
  exit 1
fi
kill -TERM "$SERVER_PID"
for attempt in {1..20}; do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    rm -f -- "$PID_FILE" "$NODE_FILE"
    printf '精酿地球已停止。\n'
    exit 0
  fi
  sleep 0.25
done
printf '已向本项目服务发送停止请求，进程正在退出。\n'
