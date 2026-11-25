import { signal, View } from "nsh";
import { AutoField, FormField, Group, IconButton, ListRow, SectionLabel, SelectField, Switch, TextField } from "../../components";
import { command, requestId, runtime, type Routine } from "../../state/runtime";
import { dismissFeedback, notify } from "../../state/feedback";
import { formatRoutineTime, parseRoutineTime } from "../../state/routine-time";
import { focusAfterAdd } from "./focus-after-add";

const timeErrorId = (routine: Routine) => `routine-time:${routine.id}`;

export function RoutineConfiguration(props: { botId: string }) {
  const name = signal(""); const prompt = signal("");
  const minutes = signal("60"); const repeat = signal("once");
  const routines = () => runtime().routines.filter((routine) => routine.botId === props.botId);
  const { inputRef, afterAdd } = focusAfterAdd(routines);
  const valid = () => !!name().trim() && !!prompt().trim() && Number(minutes()) > 0 && Number.isFinite(Number(minutes()));
  const update = (routine: Routine) => command({ type: "routine.upsert", routine });
  const add = () => {
    if (!valid()) return;
    const id = `routine-${requestId()}`;
    const intervalMs = Number(minutes()) * 60000;
    afterAdd(id);
    update({ id, botId: props.botId, name: name().trim(), prompt: prompt().trim(), enabled: true, nextRunAt: Date.now() + intervalMs, ...(repeat() === "repeat" ? { intervalMs } : {}) });
    name.set(""); prompt.set("");
  };
  const reschedule = (routine: Routine, value: string) => {
    const nextRunAt = parseRoutineTime(value);
    if (!Number.isFinite(nextRunAt)) {
      notify("error", "请填写有效的本地时间，格式为 YYYY-MM-DD HH:mm:ss", timeErrorId(routine));
    } else if (nextRunAt <= Date.now()) {
      notify("error", "下次运行时间须晚于当前时间", timeErrorId(routine));
    } else {
      update({ ...routine, nextRunAt });
    }
  };
  return <>
    <Each of={routines()} key={(r) => r.id}>{(routine) => <Group density="compact">
      <ListRow title={routine().name} description={`${routine().enabled ? formatRoutineTime(routine().nextRunAt) : "已暂停"}${routine().intervalMs ? ` · 每 ${routine().intervalMs! / 60000} 分钟` : " · 一次"}`} trailing={<Switch label={routine().name} checked={routine().enabled} onChange={(enabled) => update({ ...routine(), enabled, nextRunAt: enabled && routine().nextRunAt < Date.now() ? Date.now() + (routine().intervalMs ?? 60000) : routine().nextRunAt })} />} />
      <View class="gap-2 px-3.5 pb-2">
        <AutoField identity={routine().id} label="名称" value={routine().name} onCommit={(name) => update({ ...routine(), name })} />
        <AutoField identity={routine().id} label="任务" value={routine().prompt} onCommit={(prompt) => update({ ...routine(), prompt })} />
        <AutoField
          identity={routine().id}
          label="下次运行时间"
          value={formatRoutineTime(routine().nextRunAt)}
          placeholder="YYYY-MM-DD HH:mm:ss"
          allowEmpty
          onCommit={(value) => reschedule(routine(), value)}
          onDraftChange={() => dismissFeedback(timeErrorId(routine()))}
        />
      </View>
    </Group>}</Each>
    {routines().length === 0 ? <Group density="compact"><ListRow title="暂无例行" /></Group> : null}
    <SectionLabel title="添加例行" />
    <Group density="compact"><ListRow title="重复" trailing={<SelectField size="sm" accessibilityLabel="例行重复" value={repeat()} onChange={(v) => repeat.set(v)} options={[{ value: "once", title: "仅一次" }, { value: "repeat", title: "按此间隔" }]} />} /></Group>
    <FormField label="等待时间（分钟）">
      <TextField value={minutes()} onChange={(v) => minutes.set(v)} onSubmit={add} inputRef={inputRef} accessibilityLabel="等待时间（分钟）" placeholder="多少分钟后执行" testID="routine-minutes" />
    </FormField>
    <TextField value={name()} onChange={(v) => name.set(v)} onSubmit={add} accessibilityLabel="例行名称" placeholder="例行名称" testID="routine-name" />
    <View class="flex-row items-center gap-2">
      <View class="min-w-0 flex-1"><TextField value={prompt()} onChange={(v) => prompt.set(v)} onSubmit={add} accessibilityLabel="例行任务" placeholder="到点要做什么" testID="routine-prompt" /></View>
      <IconButton icon="plus" label="添加例行" onPress={add} disabled={!valid()} testID="routine-add" />
    </View>
  </>;
}
