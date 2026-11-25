import { ListRow, SelectField, Switch } from "../../../components";
import { setExecutor } from "../../../state/preferences";
import { runtime } from "../../../state/runtime";
import type { ExecutorSettings as Executor } from "../../../../../../packages/agent/src/protocol";

export const thinkingLevels: { value: Executor["thinkingLevel"]; title: string }[] = [
  { value: "off", title: "关闭" },
  { value: "minimal", title: "最低" },
  { value: "low", title: "低" },
  { value: "medium", title: "中" },
  { value: "high", title: "高" },
  { value: "xhigh", title: "很高" },
  { value: "max", title: "最高" },
];
export const contextWindows = [
  { value: "0", title: "跟随模型" },
  { value: "128000", title: "128K" },
  { value: "256000", title: "256K" },
  { value: "512000", title: "512K" },
  { value: "1000000", title: "1M" },
  { value: "2000000", title: "2M" },
];

/** How the Bot's own background worker (self) runs. Every change applies at once, like the other settings. */
export function ExecutorSettings() {
  const executor = () => runtime().settings.executor;
  return (
    <>
        <ListRow flush
          title="思考等级"
          description="越高越仔细，也越慢；模型不支持的等级就近调整"
          trailing={<SelectField accessibilityLabel="思考等级" testID="executor-thinking" value={executor().thinkingLevel} options={thinkingLevels} onChange={(v) => setExecutor("thinkingLevel", v as Executor["thinkingLevel"])} />}
        />
        <ListRow flush
          title="上下文窗口"
          description="接近上限前自动压缩较早的内容；不要超过模型实际支持的长度"
          trailing={<SelectField accessibilityLabel="上下文窗口" testID="executor-context" value={String(executor().contextWindow)} options={contextWindows} onChange={(v) => setExecutor("contextWindow", Number(v))} />}
        />
        <ListRow flush
          title="图片输入"
          description="读取图片时交给模型查看；模型不支持图片时关闭"
          trailing={<Switch label="图片输入" checked={executor().images} onChange={(on) => setExecutor("images", on)} />}
        />
        <ListRow flush
          title="读取项目说明"
          description="读取全局与事项目录层级的 AGENTS.md（或 CLAUDE.md）及可用技能 SKILL.md"
          trailing={<Switch label="读取项目说明" checked={executor().projectInstructions} onChange={(on) => setExecutor("projectInstructions", on)} />}
        />
    </>
  );
}
