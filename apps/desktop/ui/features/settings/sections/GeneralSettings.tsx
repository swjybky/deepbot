import { View } from "nsh";
import { FOREGROUND_MAX_TURNS_LIMIT, isForegroundMaxTurns } from "../../../../../../packages/agent/src/defaults";
import { AutoField, Group, ListRow, SectionLabel, Switch } from "../../../components";
import { notify } from "../../../state/feedback";
import { preferences, setPreference } from "../../../state/preferences";
import { command, runtime } from "../../../state/runtime";

const turnRange = `1–${FOREGROUND_MAX_TURNS_LIMIT}`;

export function GeneralSettings() {
  const validateTurns = (value: string) => {
    if (/^[1-9][0-9]*$/.test(value) && isForegroundMaxTurns(Number(value))) return true;
    notify("error", `前台工具轮次上限必须是 ${turnRange} 的整数`);
    return false;
  };
  return <>
    <SectionLabel title="本机个人空间" first />
    <Group>
      <ListRow title="我" description="消息、事项和设置保存在这台电脑" />
      <ListRow title="外观" description="暖中性色 · 对话跟随 Bot 颜色" />
      <ListRow title="打开对话时展开 Bot 信息" description="关闭时，点击头像展开" trailing={<Switch label="打开对话时展开 Bot 信息" checked={preferences().autoOpenInfo} onChange={(on) => setPreference("autoOpenInfo", on)} />} />
    </Group>
    <SectionLabel title="对话" />
    <Group>
      <ListRow title="前台工具轮次上限" description={`允许 ${turnRange} 轮，下次前台运行生效`} trailing={
        <View class="w-20">
          <AutoField label="前台工具轮次上限" hideLabel value={String(runtime().settings.foregroundMaxTurns)}
            allowEmpty validate={validateTurns}
            onCommit={(value) => command({ type: "settings.update", settings: { foregroundMaxTurns: Number(value) } })}
            testID="settings-foreground-max-turns" />
        </View>
      } />
    </Group>
  </>;
}
