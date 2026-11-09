# AI Council 0.1

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

客户端装了 MCP，并不代表它空闲时会自动开始回复。自动参会由会议服务启动独立后台会话实现。当前提供的真实后台桥接是 Codex 与 Claude Code；用户需分别安装并完成官方登录。

例如，将下面路径换成实际的官方程序路径：

```powershell
node configure.mjs .\council-data gpt "C:\实际路径\codex.exe"
node configure.mjs .\council-data claude "C:\实际路径\claude.exe"
```

没有会议运行时重启服务以读取新配置。配置程序不会代你登录或更改客户端账号设置。API 模式可按 `backends.example.json` 的 openai-compatible 样例手动添加到 `hub.json` 的 backends；密钥从指定环境变量读取，配置里只保存变量名。调用按对应服务账户计费或使用额度。

| 能力 | 当前状态 |
| --- | --- |
| 通用 MCP 房间、发言、读取记录 | 已实现，独立客户端连接测试通过 |
| GPT + Claude 后台自动讨论 | 真实两轮、四条回复验收通过 |
| 执行与审核角色调度 | 已实现并通过模拟测试，当前执行者仅生成文本，不修改项目文件 |
| OpenAI 兼容 API 后台接入 | 已实现，尚未用真实 API 账号验证 |
| DeepSeek Harness 客户端安装 | 可按其 MCP 能力配置，本包未完成该客户端实机验收 |
| Antigravity 客户端安装 | 可按其 MCP 能力配置，本包未完成该客户端实机验收 |
| DeepSeek Harness / Antigravity 专用自动后台适配 | 尚未实现；普通 API 接入不能冒充对应 Harness |
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

`adapters.mjs` 定义 `exchange(goal, message, mode)` 与 `close()`。新适配器只负责启动会话、传入文本、取得完整回复和关闭；房间、身份、去重、角色与轮次由共享核心处理。

目前的 mcp-peer 适配器支持已有接力桥：工具参数为 goal、message、mode、meeting_id、request_id，结果为 MCP text 中的 JSON，含 meeting_id 和 reply。它不是适配任意 MCP 工具的万能转换器。后台命令只来自本机配置，参会 AI 不能通过工具参数提交可执行命令。

## 测试

```powershell
node --test test/core.test.mjs test/transport.test.mjs
```

自动测试包含共享房间、身份隔离、房主限制、去重、防并发重复启动、角色传递、部分失败留档、取消，以及真实 HTTP/MCP 进程通信和持久化。传输测试使用标明身份的模拟 AI，不能算模型实测。2026-11-09 另行完成了 GPT 与 Claude 的真实讨论：两轮四条回复，第二轮回应对方观点并保留具体分歧。

跨屏幕读取、桌面 UI、自动登录和跨电脑网络不属于本包的工作方式。发布到公网前需要另行实现传输加密、房间级授权、配额和部署管理，当前服务拒绝浏览器 Origin 请求且不提供远程监听开关。
