# weread

面向人类和 Agent 的微信读书命令行工具。它基于微信读书官方支持的 API 封装成稳定的本地命令，日常使用不需要手写 `curl` 或记忆接口参数。

CLI 命令名是 `weread`。项目内同时提供了一个配套 Skill，指导 Agent 优先调用这个 CLI。

## 安装

```powershell
npm install
npm run build
npm link
```

确认命令可用：

```powershell
weread --version
weread --json doctor
```

## 配置凭据

推荐用 CLI 初始化：

```powershell
weread config set-key "wrk-..."
```

凭据会保存到：

```text
~/.weread-cli/config.json
```

也可以临时使用环境变量，环境变量优先级更高：

```powershell
$env:WEREAD_API_KEY = "wrk-..."
```

常用配置命令：

```powershell
weread config path
weread config list
weread config set-timeout 30000
```

## 常用命令

```powershell
weread doctor
weread search "三体" --scope book
weread shelf list
weread book info 3300045871
weread book chapters 3300045871
weread book progress 3300045871
weread notes notebooks --count 100
weread readdata detail --mode annually
weread discover recommend --count 12
```

Agent 或脚本解析时使用 `--json`：

```powershell
weread --json search "三体" --count 5
weread --json api list
```

低层逃生口：

```powershell
weread --json api call /store/search --param keyword=三体 --param scope=10
```

## Skill 安装

项目内 Skill 位于：

```text
skills/weread/SKILL.md
```

本机使用时可以复制到 Agent 的用户 Skill 目录，例如：

```text
~/.agents/skills/weread/SKILL.md
~/.codex/skills/weread/SKILL.md
```

Skill 的职责是指导 Agent 调用本地 `weread` CLI、处理分页和错误，并解释微信读书字段口径；具体 API 调用细节由 CLI 封装。

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
