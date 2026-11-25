# 防错规则

规则实现在 [.lint/source.json](../.lint/source.json) 和 [.lint/verify.json](../.lint/verify.json)。`pnpm --silent verify check` 会核对规则登记并运行检查和[回归测试](../scripts/check-rules.test.mjs)。新增自动检查时，以 `lint:` 加规则 ID 登记，并写明它防止哪个问题复发。

| 规则来历 | 检查 |
| --- | --- |
| NSH 基础按钮上的文字曾显示文本光标。按钮统一走 `Pressable`。见[按钮规范](../design/components/button.md#鼠标指针)。 | `lint:nsh-base-button` |
| 无效的 NSH class 会让样式缺失。组件初始化时解构 props 会把值固定下来，收不到后续更新。 | `lint:nsh-unknown-class`、`lint:nsh-component-props` |
| 不同模块曾各自拼接数据路径，导致会话和模型配置落在不同目录。见[数据目录实现](../packages/agent/src/runtime/data-directory.ts)。 | `lint:data-dir-default` |
| 类型断言和豁免注释绕过了编译器与 lint 的诊断。外部输入通过[协议解码](../packages/agent/src/wire.ts)等入口校验。 | `lint:ts-explicit-any`、`lint:ts-never-cast`、`lint:lint-suppression`、`lint:script-lint-suppression`、`lint:rust-lint-suppression`、`lint:protocol-cast` |
| 界面曾绕过共享接口访问后端、协议传输、网络和本地存储。共享组件和状态由项目规定的目录提供。见[前端架构](../DESIGN.md#架构)。 | `lint:desktop-agent-modules`、`lint:desktop-wire-transport`、`lint:desktop-network`、`lint:desktop-ui-imports`、`lint:desktop-base-controls`、`lint:desktop-local-json` |
| 各入口直接读数据库、操作账本或写集合，会绕过权限检查和事务。业务通过 Agent 的领域接口读写状态。 | `lint:agent-private-storage`、`lint:agent-private-ledger`、`lint:agent-entrypoint-ledger`、`lint:bot-library-write` |
| 直接发 HTTP、启动连接器、写私有配置会绕过统一的超时、环境隔离和落盘处理。相关入口见 [HTTP](../packages/agent/src/runtime/http.ts)、[连接器进程](../packages/agent/src/connectors/support.ts)及[私有 JSON](../packages/agent/src/runtime/private-json.ts)。 | `lint:agent-http`、`lint:connector-child-process`、`lint:connector-config-write` |
| 场景曾直接读取私有模型文件。读取同一测试实例的公开快照，才能核对界面操作对外呈现的结果。 | `lint:verify-model-snapshot` |
