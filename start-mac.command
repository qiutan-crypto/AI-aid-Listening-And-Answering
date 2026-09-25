#!/bin/bash
# Mac：双击启动英语对话助手（第一次可能要右键 →「打开」）
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "没有找到 Node.js。请先从 https://nodejs.org 安装 LTS 版本，然后再双击这个文件。"
  read -r -p "按回车键关闭..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "第一次运行，正在安装需要的组件..."
  npm install || { read -r -p "安装失败，按回车键关闭..."; exit 1; }
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "已创建 .env。请在打开的「文本编辑」里填好 DEEPGRAM_API_KEY 和 GEMINI_API_KEY，保存后关闭，再回到这里按回车。"
  open -e .env
  read -r -p "填好并保存后，按回车键继续..."
fi

# 读取 .env 里的 PORT（没有就用 3000）
PORT=$(grep -E '^[[:space:]]*PORT[[:space:]]*=' .env | tail -1 | cut -d= -f2 | tr -d '[:space:]"')
PORT=${PORT:-3000}

# 服务器启动几秒后，用 Chrome 打开页面（没有 Chrome 就用默认浏览器）
( sleep 3; open -a "Google Chrome" "http://localhost:$PORT" 2>/dev/null || open "http://localhost:$PORT" ) &

npm start
read -r -p "程序已停止，按回车键关闭..."
