import { signal, View } from "nsh";
import { Button, EmptyState, Group, ListRow, SectionLabel, StatusDot, TextField } from "../../../components";
import { command, connected, runtime } from "../../../state/runtime";
export function ComputerSettings() {
  const folder = signal("");
  const add = () => { const path = folder().trim(); if (!path) return; command({ type: "settings.update", settings: { connectedFolders: [...new Set([...runtime().settings.connectedFolders, path])] } }); folder.set(""); };
  return <>
    <SectionLabel title="执行电脑" first /><Group><ListRow icon="monitor" title="这台电脑" description={connected() ? "本机服务已连接" : "本机服务未连接"} trailing={<StatusDot online={connected()} />} /></Group>
    <SectionLabel title="已连接的文件夹" />
    <Each of={runtime().settings.connectedFolders} key={(path: string) => path}>{(path) => <Group><ListRow title={path()} trailing={<Button label="断开" size="sm" onPress={() => command({ type: "settings.update", settings: { connectedFolders: runtime().settings.connectedFolders.filter((p) => p !== path()) } })} />} /></Group>}</Each>
    {runtime().settings.connectedFolders.length === 0 ? <EmptyState text="还没有连接文件夹，文件工具仅在授权目录内运行" /> : null}
    <TextField value={folder()} onChange={(v) => folder.set(v)} onSubmit={add} accessibilityLabel="文件夹路径" placeholder="连接一个绝对路径" testID="connected-folder-input" />
    <View class="flex-row"><Button label="连接文件夹" disabled={!folder().trim()} onPress={add} testID="connected-folder-add" /></View>
  </>;
}
