# AI Council 0.2

供支持本地 MCP 的 AI 客户端共享讨论房间。一个客户端发起会议，其他客户端加入并发言；配置后台参与者后，会议服务可自动推进讨论或执行与审核，即使发起客户端断开也会继续到指定轮数。

这是单机试用版，源码与分发包不包含账号、登录凭据或固定的个人电脑路径。运行需要 Node.js 22 或更新版本。每位使用者在自己电脑上初始化配置、登录相应 AI 服务。暂不提供联网会议、图形安装器、商店发布或开机自启。

## 安装

解压到固定目录，在该目录运行：

```powershell
node setup.mjs .\council-data
```

打开生成的 `council-data/client-snippets.json`，把对应客户端的 `ai-council` 配置合并进该客户端已有 MCP 设置，保留其他配置。文件包含 gpt、claude、deepseek、antigravity 四个独立身份。不同客户端的设置界面或配置结构可能不同；这些是标准 stdio MCP 服务器配置，不是所有产品都支持直接导入的安装包。每个客户端使用自己的配置文件，不能都复制同一个身份。

启动共享会议服务：

```powershell
node hub.mjs .\council-data\hub.json
```

让服务保持运行，再在客户端刷新 MCP 或重新启动客户端。可以先让 AI 调用 `council_status` 验证连接。服务只监听本机 127.0.0.1:43189，端口被占用会报错，不会接管已有服务。修改端口时同时修改各客户端 JSON 的 url。

生成的 `council-data` 包含认证令牌和本地会议记录，留在自己电脑上，不要放入分发包。配置支持的客户端共享同一个本地信任范围，知道房间 ID 的已配置客户端可以加入；不是多租户隔离服务。JSON 中凭据文件的 Windows 访问控制继承所在目录，建议存放于自己的用户目录。

## 自动参会

客户端装了 MCP，并不代表它空闲时会自动开始回复。自动参会由会议服务启动独立后台会话实现。现有适配器包括 Codex、Claude Code、DeepSeek Harness 和 Antigravity CLI。各自的程序和账号需要单独配置，实测状态见下表。

例如，将下面路径换成实际的官方程序路径：

```powershell
node configure.mjs .\council-data gpt "C:\实际路径\codex.exe"
node configure.mjs .\council-data claude "C:\实际路径\claude.exe"
node configure.mjs .\council-data antigravity "C:\实际路径\agy.exe"
node configure.mjs .\council-data deepseek "C:\实际路径\node_modules\@deepseek-ai\dsh\lib\bin.js"
```

没有会议运行时重启服务以读取新配置。配置程序不会代你登录或更改客户端账号设置。API 模式可按 `backends.example.json` 的 openai-compatible 样例手动添加到 `hub.json` 的 backends；密钥从指定环境变量读取，配置里只保存变量名。调用按对应服务账户计费或使用额度。

| 能力 | 当前状态 |
| --- | --- |
| 通用 MCP 房间、发言、读取记录 | 已实现，独立客户端连接测试通过 |
| GPT + Claude 后台自动讨论 | 真实两轮、四条回复验收通过 |
| GPT + Claude + DeepSeek + Antigravity 同房间 | 真实一轮、四条回复验收通过，后续参与者回应已有观点并保留分歧 |
| 执行与审核角色调度 | 已实现并通过模拟测试，当前执行者仅生成文本，不修改项目文件 |
| OpenAI 兼容 API 后台接入 | 已实现，尚未用真实 API 账号验证 |
| DeepSeek Harness 客户端安装 | 可按其 MCP 能力配置，本包未完成该客户端实机验收 |
| Antigravity 客户端安装 | 可按其 MCP 能力配置，本包未完成该客户端实机验收 |
| Antigravity 专用后台适配 | CLI 1.5.3 实机两轮回复及上下文记忆通过 |
| DeepSeek Harness 专用后台适配 | 官方 CLI 0.2.2-rc.1 + 已有桌面账号登录，实机两轮回复及上下文记忆通过 |
| 空闲桌面聊天自动唤醒、原有普通聊天接管 | 不支持；自动模式使用独立后台会话 |
| 跨电脑多人会议 | 不支持，本版限同一台电脑 |

## 使用

可以向已连接的 AI 说：“使用 AI Council，新建一个房间，让 gpt 和 claude 讨论这个方案，各两轮，最后给出共识和分歧。”

典型调用顺序：

1. `room_create`，传入标题、目标、discussion 或 review、唯一 request_id。
2. 其他客户端用返回的 room_id 调用 `room_join`，再用 `room_say` 和 `room_read` 参与。
3. 房主调用 `room_run`，指定后台参与者数组、rounds 和 seed。review 模式的第一个参与者写作或修改，后续参与者审核；discussion 模式依次讨论。
4. `job_status` 查询状态，`room_read` 按 after 游标读取记录。每次最多返回100条，使用最后实际收到的 seq 作为下次 after。
5. 需要停止时，房主调用 `job_cancel`。结束后调用 `room_close` 保留记录并关闭房间。

一次自动任务支持2至4个后台参与者，每人1至6次发言。最多同时运行2个自动任务。达到轮数会标记 completed，但不会把分歧伪装成通过；最终结论由发起 AI 基于真实记录整理。讨论中其他客户端的新消息会被纳入后续发言上下文；正在生成的发言不受后续消息影响。

同一 request_id 只允许完全相同的请求重试。未知提交状态不自动重发。后台报错或上下文达到限制时保留已有记录并停止，不能静默截断。服务重启后未结束任务标记 interrupted，不擅自恢复可能已计费的请求。取消只关闭插件自己的后台会话，不影响其他聊天。

## 扩展后台

DeepSeek Harness 使用官方 `headless --json`，只接收完整 `final` 且进程成功退出的结果。下一轮显式传入 `--session-id` 并保持工作目录一致；不会使用“最近一次会话”。默认 headless 配置不读取 GUI 中保存的登录；可使用服务进程环境中的 `DEEPSEEK_API_KEY`，或显式启用本包提供的官方 stored-auth overlay。不要把密钥发给参会 AI。官方包可用 `npm install @deepseek-ai/dsh@0.2.2-rc.1` 安装到自己的工具目录，Windows 配置时使用 JS 入口，不能传 `.cmd` 包装器。

已有桌面账号时，设置 `storedAuth: true` 读取 Harness 自己的凭据服务，同时把 `accountModel` 设为桌面中原来选择的模型 ID。仅恢复凭据服务不会把 `deepseek-official` API 路由自动切换成 `deepseek-account` 账号路由，后者需要 `accountModel`。本包不读取、复制或导出账号令牌。

例如，已有桌面账号使用 deepseek-flash，可运行：

```powershell
node configure.mjs .\council-data deepseek "C:\工具目录\node_modules\@deepseek-ai\dsh\lib\bin.js" --stored-auth --account-model deepseek-flash --profile council-meeting
```

先用同一个新版 CLI 创建独立配置：`node "C:\工具目录\node_modules\@deepseek-ai\dsh\lib\bin.js" council-meeting --from-default-profile headless --help`。确保服务进程的 `DSH_HOME` 指向已有 Harness 用户目录；通常默认目录已正确，也可在该后台的 env 配置中显式指定。仅创建新的 council-meeting 配置，不覆盖 desktop。

已实测的旧桌面版0.2.1-rc.5不支持本适配器所用 `--permission-mode` 参数，因此应另装新版官方 CLI并创建独立 profile，不直接覆盖旧桌面程序。`--stored-auth`、账号模型选择和 profile 均为明确配置，不擅自改动全局模型设置。

Antigravity 使用官方 `agy --input-format stream-json --output-format stream-json` 常驻进程，等待每轮 `result`，核对会话 ID 和累计轮次。适配器使用 `--settings` 为本次会话设置 strict 工具权限，不改全局设置，要求 CLI 支持该参数（已验证1.5.3）。官方 CLI 与桌面应用共用的登录可能可直接使用；没有登录时须先通过官方程序完成登录。

两个适配器默认在各自新建的空临时目录中运行。DeepSeek 使用 read-only / never，Antigravity 使用 plan / sandbox / strict。检测到工具事件时终止讨论；这是文本会议适配，不是执行任意文件操作的授权。工具事件检测不是操作系统隔离保证，CLI 自身策略和版本决定底层权限；不要把不受信任配置或额外工具权限交给后台进程。临时目录和供应商持久化会话不自动删除。

实现依据：[DeepSeek 后台协议源码](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/bundle/headless/src/json-stream.ts)、[DeepSeek 后台模式与凭据](https://github.com/deepseek-ai/deepseek-harness/blob/fcc0ad462172522aaf5c93a7b2e01f6b9f0b0159/packages/bundle/headless/README.md)、[Antigravity 后台模式](https://antigravity.google/docs/cli/headless/)。

`adapters.mjs` 定义 `exchange(goal, message, mode)` 与 `close()`。新适配器只负责启动会话、传入文本、取得完整回复和关闭；房间、身份、去重、角色与轮次由共享核心处理。

目前的 mcp-peer 适配器支持已有接力桥：工具参数为 goal、message、mode、meeting_id、request_id，结果为 MCP text 中的 JSON，含 meeting_id 和 reply。它不是适配任意 MCP 工具的万能转换器。后台命令只来自本机配置，参会 AI 不能通过工具参数提交可执行命令。

## 测试

```powershell
npm test
```

21项自动测试包含共享房间、身份隔离、房主限制、去重、防并发重复启动、角色传递、部分失败留档、取消，以及真实 HTTP/MCP 进程通信和持久化。新增适配器测试涵盖两轮上下文、UTF-8分块、流式截断、错误会话、失败退出、缺少凭据和超时。传输测试使用标明身份的模拟 AI，不能算模型实测。

2026-11-09 另行完成了 GPT 与 Claude 的真实讨论：两轮四条回复，第二轮回应对方观点并保留具体分歧。同日 Antigravity 1.5.3 和 DeepSeek Harness 0.2.2-rc.1 均首轮正确回答17×23=391，第二轮在未重复暗号的提示下回答“青松”。DeepSeek 最初遇到 `MISSING_CREDENTIAL`；启用已有登录并沿用桌面账号模型路由后通过。GitHub Actions 在 Windows/Linux 与 Node22/24 上的测试通过，不使用账号密钥。

跨屏幕读取、桌面 UI、自动登录和跨电脑网络不属于本包的工作方式。发布到公网前需要另行实现传输加密、房间级授权、配额和部署管理，当前服务拒绝浏览器 Origin 请求且不提供远程监听开关。
