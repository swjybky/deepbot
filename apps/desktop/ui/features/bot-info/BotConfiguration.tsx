import { Scroll, signal, View, windowSize } from "nsh";
import { DEFAULT_BOT_MAX_CONCURRENT } from "../../../../../packages/agent/src/defaults";
import { ActionRow, AutoField, FormField, IconButton, Group, ListRow, Modal, ModalHeader, SectionLabel, SelectField, TextField } from "../../components";
import { currentRuntimeBot } from "../../state/bots";
import { notify } from "../../state/feedback";
import { command, runtime, type RuntimeBot } from "../../state/runtime";
import { botConfiguration, closeModal, modal, openBotConfiguration } from "../../state/ui";
import { RuleConfiguration } from "./RuleConfiguration";
import { RoutineConfiguration } from "./RoutineConfiguration";

export function BotConfiguration() {
  const update = (patch: Partial<Pick<RuntimeBot, "name" | "instructions" | "modelConfigId" | "maxConcurrent" | "folders">>) => {
    const bot = currentRuntimeBot();
    if (bot) command({ type: "bot.upsert", bot: { id: bot.id, name: bot.name, ...patch } });
  };
  const validateConcurrency = (value: string) => {
    if (/^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value))) return true;
    notify("error", "事项并发上限必须是正整数");
    return false;
  };
  const folder = signal("");
  const folders = () => currentRuntimeBot()?.folders ?? [];
  const addFolder = () => { const path = folder().trim(); if (!path) return; update({ folders: [...new Set([...folders(), path])] }); folder.set(""); };
  return <View class="w-full min-w-0 self-stretch gap-2.5" testID="bot-configuration">
    <If when={currentRuntimeBot()}>{(bot) => <>
      <AutoField identity={bot().id} label="名字" value={bot().name} onCommit={(name) => update({ name })} testID="bot-config-name" />
      <AutoField identity={bot().id} label="人设与工作要求" value={bot().instructions} allowEmpty onCommit={(instructions) => update({ instructions })} testID="bot-config-instructions" />
      <FormField label="模型配置"><SelectField form accessibilityLabel="Bot 模型配置" value={bot().modelConfigId} options={runtime().modelConfigs.map(c => ({ value: c.id, title: c.name }))} onChange={(modelConfigId) => update({ modelConfigId })} testID="bot-config-model" /></FormField>
      <AutoField identity={bot().id} label="事项并发上限" value={String(bot().maxConcurrent ?? DEFAULT_BOT_MAX_CONCURRENT)} allowEmpty validate={validateConcurrency} onCommit={(value) => update({ maxConcurrent: Number(value) })} testID="bot-config-max-concurrent" />
      <ActionRow title="规矩" onPress={() => openBotConfiguration("rules")} testID="bot-config-rules" />
      <SectionLabel title="文件夹" />
      <Group density="compact">
        <ListRow title="工作区" description={bot().workspace} />
        <ListRow title="公共文件夹" description={runtime().sharedFolder} />
        <Each of={bot().folders} key={(path: string) => path}>{(path) => <ListRow title={path().split("/").filter(Boolean).at(-1) ?? path()} description={path()} trailing={<IconButton icon="trash" variant="ghost" label={`移除 ${path()}`} onPress={() => update({ folders: folders().filter((p) => p !== path()) })} testID={`bot-folder-remove-${path()}`} />} />}</Each>
        {bot().folders.length === 0 ? <ListRow title="暂无关联文件夹" description="让 Bot 记住你的工作文件夹，或在下面添加" /> : null}
      </Group>
      <View class="flex-row items-center gap-2"><View class="min-w-0 flex-1"><TextField value={folder()} onChange={(v) => folder.set(v)} onSubmit={addFolder} accessibilityLabel="关联文件夹路径" placeholder="关联一个绝对路径" testID="bot-folder-input" /></View><IconButton icon="plus" label="关联文件夹" disabled={!folder().trim()} onPress={addFolder} testID="bot-folder-add" /></View>
    </>}</If>
  </View>;
}

export function BotConfigurationDialog() {
  const selection = () => modal() === "botConfiguration" ? botConfiguration() : null;
  const owner = () => runtime().bots.find((bot) => bot.id === selection()?.botId);
  const title = () => selection()?.section === "rules" ? "规矩" : "例行";
  return <Modal
    open={!!owner()}
    onClose={closeModal}
    width={Math.min(560, windowSize().width - 32)}
    height={Math.min(620, windowSize().height - 32)}
    testID="bot-configuration-dialog"
  >
    <ModalHeader title={`${owner()?.name ?? ""} · ${title()}`} onClose={closeModal} />
    <If when={selection()}>{(entry) =>
      <Scroll class="min-h-0 flex-1" contentClass="gap-2.5 px-6 py-5" testID={`bot-config-${entry().section}-editor`}>
        {entry().section === "rules" ? <RuleConfiguration botId={entry().botId} /> : <RoutineConfiguration botId={entry().botId} />}
      </Scroll>
    }</If>
  </Modal>;
}
