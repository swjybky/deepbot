import { signal, View } from "nsh";
import { FormField, Group, IconButton, ListRow, SectionLabel, SelectField, Switch, TextField } from "../../components";
import { assigneeOptions, command, requestId, runtime, type RouteRule } from "../../state/runtime";
import { focusAfterAdd } from "./focus-after-add";

export function RuleConfiguration(props: { botId: string }) {
  const keywords = signal("");
  const directory = signal("");
  const category = signal("");
  const assignee = signal("self");
  const askFirst = signal(false);
  const rules = () => runtime().rules.filter((rule) => rule.botId === props.botId);
  const { inputRef, afterAdd } = focusAfterAdd(rules);
  const options = () => assigneeOptions().map(({ value, title }) => ({ value, title }));
  const matches = () => keywords().split(/[,，]/).map((value) => value.trim()).filter(Boolean);
  const valid = () => !!(matches().length || directory().trim() || category().trim());
  const update = (rule: RouteRule) => command({ type: "rule.upsert", rule });
  const add = () => {
    if (!valid()) return;
    const id = `rule-${requestId()}`;
    afterAdd(id);
    update({
      id, botId: props.botId,
      name: matches().length ? keywords().trim() : directory().trim() || category().trim(),
      match: {
        ...(matches().length ? { keywords: matches() } : {}),
        ...(directory().trim() ? { directory: directory().trim() } : {}),
        ...(category().trim() ? { category: category().trim() } : {}),
      },
      assignee: assignee(), askFirst: askFirst(), enabled: true, confirmed: true,
    });
    keywords.set(""); directory.set(""); category.set("");
  };
  return <>
    <Each of={rules()} key={(r) => r.id}>{(rule) => <Group density="compact">
      <ListRow title={rule().name} description={[rule().match.keywords?.join("、"), rule().match.directory, rule().match.category, rule().confirmed ? "已确认" : "待确认"].filter(Boolean).join(" · ")} trailing={<Switch label={`启用 ${rule().name}`} checked={rule().enabled && rule().confirmed} onChange={(enabled) => update({ ...rule(), enabled })} />} />
      <View class="px-3.5">
        <FormField label="派活对象"><SelectField form accessibilityLabel={`修改 ${rule().name} 派活对象`} value={rule().assignee} options={options()} onChange={(assignee) => update({ ...rule(), assignee })} /></FormField>
      </View>
      <ListRow title="每次派工先问我" trailing={<Switch label={`确认 ${rule().name} 派工`} checked={rule().askFirst} onChange={(askFirst) => update({ ...rule(), askFirst })} />} />
    </Group>}</Each>
    {rules().length === 0 ? <Group density="compact"><ListRow title="暂无规矩" /></Group> : null}
    <SectionLabel title="添加规矩" />
    <TextField value={keywords()} onChange={(v) => keywords.set(v)} onSubmit={add} inputRef={inputRef} accessibilityLabel="规矩关键词" placeholder="匹配关键词，用逗号分隔" testID="rule-keywords" />
    <TextField value={directory()} onChange={(v) => directory.set(v)} onSubmit={add} accessibilityLabel="规矩目录" placeholder="限定目录，可留空" />
    <TextField value={category()} onChange={(v) => category.set(v)} onSubmit={add} accessibilityLabel="动作类别" placeholder="动作类别，可留空" />
    <Group density="compact">
      <ListRow title="每次派工先问我" trailing={<Switch label="每次派工先问我" checked={askFirst()} onChange={(v) => askFirst.set(v)} />} />
    </Group>
    <View class="flex-row items-end gap-2">
      <FormField label="派活对象"><SelectField form accessibilityLabel="新规矩的派活对象" value={assignee()} options={options()} onChange={(v) => assignee.set(v)} /></FormField>
      <IconButton icon="plus" label="添加规矩" onPress={add} disabled={!valid()} testID="rule-add" />
    </View>
  </>;
}
