import { Group, ListRow, SectionLabel, Switch } from "../../../components";
import { preferences, setPreference } from "../../../state/preferences";
export function GeneralSettings() {
  return <><SectionLabel title="本机个人空间" first /><Group><ListRow title="我" description="消息、事项和设置保存在这台电脑" /><ListRow title="外观" description="暖中性色 · 对话跟随 Bot 颜色" /><ListRow title="打开对话时展开 Bot 信息" description="关闭时，点击头像展开" trailing={<Switch label="打开对话时展开 Bot 信息" checked={preferences().autoOpenInfo} onChange={(on) => setPreference("autoOpenInfo", on)} />} /></Group></>;
}
