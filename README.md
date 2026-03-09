# HiMilet（陪伴式 AI 管家）

HiMilet 的目标不是“只会聊天的桌宠”，而是一个 **有陪伴感的 AI 管家**：

- 常驻桌面，像伙伴一样陪你工作与生活
- 能聊天，也能主动关怀（提醒、问候、状态反馈）
- 执行有风险操作前先征求你的确认（HITL 审批）
- 后续可扩展为个人效率与工具中心（agent 能力持续接入）

当前版本以 Windows 为起点，通过中立协议接入 LLM、工具调用与审批流程。

## 项目结构

- `src/HiMilet.Desktop`
  - WPF 前端桌宠（透明窗体、桌宠渲染、拖拽/点击、聊天面板、审批弹窗、WS 客户端）
- `src/HiMilet.Protocol`
  - 中立 WebSocket 协议契约与校验（Envelope、消息类型、关联追踪）
- `src/HiMilet.Adapters.OpenClaw`
  - OpenClaw 事件到中立协议的适配层
- `backend/himilet-gateway`
  - Node.js 网关（WS + HTTP + SQLite + 聊天编排 + 工具运行时 + 权限与审计）
- `tests/HiMilet.Protocol.Tests`
  - 协议与映射相关测试

## 当前已实现能力（MVP+）

- 桌宠前端（陪伴壳）：
  - 复用 VPet 渲染核心，支持基础动作映射（Idle/Thinking/Work/Sleep/Approval）
  - 聊天面板（用户发送、助手流式显示、中断后继续）
  - 基础用户事件上报（点击、拖拽、菜单操作）
- 网关后端（管家能力底座）：
  - 聊天编排（含流式输出、断线重连清理、旧流隔离）
  - 工具调用：提醒、找文件（带权限守卫和审批）
  - 配置管理：LLM Profiles、权限策略、提醒持久化
  - 密钥安全：Windows DPAPI（不使用 keytar）
- 新增配置能力基础：
  - `/api/settings/client` 客户端设置接口（GET/PUT）
  - `desktop-settings.json` 本地配置模型（用于前端/文件/后端三通道对齐）

## 运行方式（Windows）

### 1) 运行网关

```powershell
cd HiMilet\backend\himilet-gateway
npm install
npm run dev
```

默认地址：

- WS: `ws://127.0.0.1:18789`
- HTTP: `http://127.0.0.1:18790`

或直接双击：`run-gateway.bat`

### 2) 运行桌宠前端

```powershell
cd HiMilet
dotnet restore HiMilet.sln
dotnet build HiMilet.sln -c Debug
dotnet run --project src/HiMilet.Desktop/HiMilet.Desktop.csproj -c Debug
```

或直接双击：`run-desktop.bat`

### 3) Visual Studio 启动

1. 打开 `HiMilet.sln`
2. 启动项目设为 `HiMilet.Desktop`
3. `Debug | Any CPU`
4. `F5` 或 `Ctrl+F5`

## 常见问题

- 启动后看不到窗口：
  - 这是透明置顶窗体，且 `ShowInTaskbar=false`，先检查进程：
  - `Get-Process HiMilet.Desktop`
- 构建时报 DLL 被占用：
  - 先结束进程再构建：
  - `Stop-Process -Name HiMilet.Desktop -Force`
- 聊天提示“尚未配置可用的 LLM Profile”：
  - 需要先通过后端 API 配置 profile 和 secret。

## 协议说明（中立 WS）

Envelope 结构：

```json
{ "type": "...", "session_id": "...", "trace_id": "...", "payload": {}, "timestamp": "..." }
```

核心事件：

- 下行：`pet.action`, `pet.speak`, `pet.state`, `approval.request`, `chat.assistant`, `system.notice`
- 上行：`user.event`, `approval.result`, `chat.user`, `chat.continue`, `client.status`

## 项目定位说明（我们要做什么）

HiMilet 要做的是“陪伴式 AI 管家”，而不是简单桌宠换皮：

- 体验层：有性格、有反馈、会关心你的桌面伙伴
- 能力层：聊天 + 主动提醒 + 工具执行 + 审批闭环
- 架构层：与 VPet、网关、工具系统保持松耦合，便于持续迭代

一句话：**以陪伴感为产品目标，以可扩展 AI 能力为长期方向。**
