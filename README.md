# weread

面向人类和 Agent 的微信读书命令行工具。它基于微信读书官方支持的 API 封装成稳定的本地命令，日常使用不需要手写 `curl` 或记忆接口参数。

CLI 命令名是 `weread`。项目内同时提供了一个配套 Skill，指导 Agent 优先调用这个 CLI。

## 安装

安装 CLI：

```bash
npm install -g weread-agent-cli
```

安装 Skill：

```bash
npx skills add shiquda/weread-cli --yes
```

确认命令可用：

```bash
weread --version
weread doctor
```

也可以把下面这段发给 Agent，让它阅读本项目并完成安装和配置引导：

```text
请阅读 https://github.com/shiquda/weread-cli ，帮我安装 WeRead CLI 和配套 Skill：
1. 使用 npm 安装已发布的 CLI 包 weread-agent-cli，确认 weread 命令可用。
2. 使用 npx skills add shiquda/weread-cli --yes 安装配套 Skill。
3. 运行 weread doctor 检查本机配置。
4. 如果还没有 API Key，请指导我打开 https://weread.qq.com/r/weread-skills 获取 key，并用 weread config set-key "wrk-..." 完成登录配置。
```

本地开发：

```bash
npm install
npm run build
npm link
```

## 配置凭据

首次使用需要先获取微信读书 API Key：

1. 打开官方页面：https://weread.qq.com/r/weread-skills
2. 登录要连接的微信读书账号。
3. 在页面中获取 API Key，格式通常是 `wrk-...`。
4. 用 CLI 保存到本机：

```powershell
weread config set-key "wrk-..."
```

凭据会保存到：

```text
~/.weread-cli/config.json
```

也可以临时使用环境变量，环境变量优先级更高：

```bash
export WEREAD_API_KEY="wrk-..."
```

常用配置命令：

```powershell
weread config path
weread config list
weread config set-timeout 30000
```

配置后检查：

```bash
weread doctor
```

## 常用命令

```powershell
weread doctor
weread search "三体" --scope book
weread book resolve "三体"
weread shelf list
weread shelf recent --limit 10
weread book info 3300045871
weread book chapters 3300045871
weread book progress 3300045871
weread notes notebooks --count 100
weread notes top --limit 20
weread notes export 3300045871 --format markdown --output notes.md
weread readdata detail --mode annually
weread readdata summary --mode monthly
weread discover recommend --count 12
```

Agent 默认建议使用 `--json`，脚本或精确结构化解析也应使用 `--json`。大输出可先写入文件再摘要回复：

```bash
weread --json --compact search "三体" --count 5
weread --json notes bookmarks 3300045871 --compact > highlights.json
weread notes export 3300045871 --format markdown --output notes.md
```

Agent 或脚本做数据解析时应依赖 `--json` 的字段；普通终端查看可以直接使用 human-readable 输出。human 输出会在截断时提示 `Showing first ...`，可用 `--limit` 或 `--all` 控制显示量。

低层逃生口：

```powershell
weread --json api call /store/search --param keyword=三体 --param scope=10
```

## Skill 安装

Skill 需要配合已发布的 CLI 包使用：

```bash
npm install -g weread-agent-cli
npx skills add shiquda/weread-cli --yes
```

OpenClaw 等需要显式工作目录的环境可用：

```bash
npx skills add shiquda/weread-cli --yes --workdir ~/.openclaw/workspace
```

项目内 Skill 位于：

```text
skills/weread/SKILL.md
skills/weread/references/
```

也可以手动复制到 Agent 的用户 Skill 目录。

Skill 的职责是指导 Agent 调用本地 `weread` CLI、处理分页和错误，并解释微信读书字段口径；具体 API 调用细节由 CLI 封装。首次配置说明在 `skills/weread/references/first-use.md`，领域口径说明在 `skills/weread/references/domain-rules.md`。

## 测试

```powershell
npm run check
npm test
npm run build
```

`npm test` 默认使用本地模拟服务，不依赖真实微信读书接口。真实连通性可以用：

```powershell
weread --json search "三体" --count 1
```
