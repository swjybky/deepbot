# 动态事项首轮验证

- **时间**　2026-11-17 22:37–22:39 PST（UTC−08:00）
- **代码**　`e3324505148f078e06725ca8b29470865efc6eb1` 工作区，改动涉及 `BotInfoPanel`、`ActivityCard`、`DisclosureRow`、`ThinkingIndicator` 和 `PulsingDots`
- **环境**　Ubuntu 26.04.1、NSH 0.4.0 (e626a8d)、默认 GTK Wayland、1×、1280×800、Noto Sans
- **数据**　隔离协议 Fixture，注入一条执行中事项和一条已交付事项
- **结论**　已取得原布局对照和单行布局的原生证据。按用户追加反馈移除列表提示图标后的结果见 [最终验证](../223917-without-arrows/report.md)。

## 复现与检查

1. 通过 Fixture 打开动态面板，显示用于检查截断的长标题和四行进度，截取修改前窗口。
2. 修改后核对事项只显示标题、执行中显示圆点、「已结束」移到电脑下方并默认折叠，分别打开两组事项详情。
3. 拖至 240 像素宽，检查标题截断和运行圆点。

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 旧版运行新增断言 | 退出 1，复现列表渲染进度正文 | [运行日志](logs/native-before.log) |
| 类型及 Rust 检查 | 退出 0 | [运行日志](logs/check.log) |
| 事项专题 headless | 2/2 通过 | [运行日志](logs/headless-focused.log) |
| Linux 原生事项专题 | 默认宽度及拖窄均通过 | [默认宽度](logs/native-after.log)、[拖窄](logs/native-final.log) |
| 全量 headless 中间结果 | 一处综合测试沿用旧列表预期，最终版已更新该测试 | [首轮](logs/headless.log)、[跟进](logs/headless-final.log) |

## 原生前后对比

| 检查项 | 修改前 | 首轮修改后 | 观察 |
| --- | --- | --- | --- |
| 右侧事项 | [原生原图](screenshots/01-before.png) | [默认折叠](screenshots/02-after-frame-2.png) | 列表变为单行，圆点替换「执行中」，「已结束」移到电脑下方 |
| 展开与详情 | [修改前](screenshots/01-before.png) | [展开](screenshots/03-expanded.png)、[执行中详情](screenshots/04-running-detail.png)、[结束详情](screenshots/05-ended-detail.png) | 两组可进详情，进度全文可展开 |
| 动效 | 原执行中文字 | [关键帧 1](screenshots/02-after-frame-1.png)、[关键帧 2](screenshots/02-after-frame-2.png)、[关键帧 3](screenshots/02-after-frame-3.png) | 圆点区域变化，其他列表像素保持稳定，[像素结果](logs/animation-pixels.log) |
| 窄栏 | 默认 320 像素基准 | [240 像素](screenshots/08-narrow.png) | 标题可省略，圆点在栏内 |

已查看默认宽度对比、展开、详情与动效关键帧。首轮原生操作使用 Fixture 打开面板，再注入点击。发布与用户 Bot 数据验收未执行。对话展示最终无进入箭头版本的截图。
