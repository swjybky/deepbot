import { effect, signal, Scroll, Text, View } from "nsh";
import { ActionRow, ActivityCard, BotAvatar, DisclosureRow, EmptyState, Group, IconButton, ListRow, PulsingDots, SectionLabel, SegmentedTabs, Switch, TextField } from "../../components";
import { currentBot, currentBotId, currentWorks, setTaskEnabled } from "../../state/bots";
import { command, connected, phaseLabels, requestId, runtime, type Work } from "../../state/runtime";
import { infoPanelOpen, infoTab, openBotConfiguration, openLibraryPreview, openWorkDetail, setInfoPanel } from "../../state/ui";
import { ArtifactCard } from "./ArtifactCard";
import { BotConfiguration } from "./BotConfiguration";
export function BotInfoPanel() {
  return <View class="min-w-0 flex-1 overflow-hidden bg-card" testID="bot-info">
    <View desktop={{ windowDrag: true }} class="px-4 pt-3.5" testID="bot-info-navigation"><IconButton icon="close" label="关闭 Bot 信息" onPress={() => setInfoPanel(false)} /></View>
    <View class="items-center gap-2.5 px-4 pb-3 pt-1"><BotAvatar shape={currentBot().shape} color={currentBot().color} size={84} /><Text role="header" class="text-heading font-semibold text-foreground">{currentBot().name}</Text><SegmentedTabs items={[{ value: "activity", label: "动态" }, { value: "library", label: "资料库" }, { value: "configuration", label: "配置" }]} value={infoTab()} onChange={(tab) => infoTab.set(tab)} /></View>
    <Scroll class="flex-1" contentClass="gap-2 px-4 pb-5 pt-1">
      {infoTab() === "activity" ? <Activity /> : infoTab() === "library" ? <Library /> : <BotConfiguration />}
    </Scroll>
  </View>;
}
function Activity() {
  const endedExpanded = signal(false);
  effect(() => {
    currentBotId();
    if (infoPanelOpen()) endedExpanded.set(false);
  });
  const activeWorks = () => currentWorks().filter((w) => w.state !== "ended");
  const endedWorks = () => currentWorks().filter((w) => w.state === "ended");
  const manageRoutines = () => openBotConfiguration("routines");
  return <>
    <SectionLabel title="事项" first />
    <View class="gap-2" testID="works-active">
      <Each of={activeWorks()} key={(w) => w.id}>{(work) => <WorkListCard work={work()} />}</Each>
      {activeWorks().length === 0 ? <EmptyState text="暂无进行中的事项" /> : null}
    </View>
    <SectionLabel title="即将进行" /><Each of={currentBot().tasks} key={(t) => t.id}>{(task) => <Group density="compact"><ListRow title={task().name} description={task().enabled ? task().schedule : "已暂停"} trailing={<Switch label={task().name} checked={task().enabled} onChange={(on) => setTaskEnabled(currentBot().id, task().id, on)} />} /></Group>}</Each>
    {currentBot().tasks.length === 0 ? <ActionRow title="暂无例行" accessibilityLabel="暂无例行，管理例行" tooltip="管理例行" testID="routines-empty" onPress={manageRoutines} /> : <ActionRow title="管理例行" testID="routines-manage" onPress={manageRoutines} />}
    <SectionLabel title="电脑" /><Group density="compact"><ListRow title="这台电脑" description={connected() ? "本机服务已连接" : "本机服务未连接"} /></Group>
    <DisclosureRow title="已结束" verticalChevron open={endedExpanded()} onPress={() => endedExpanded.set(!endedExpanded())} testID="works-ended-toggle" />
    {endedExpanded() ? <View class="gap-2" testID="works-ended">
      <Each of={endedWorks()} key={(w) => w.id}>{(work) => <WorkListCard work={work()} />}</Each>
      {endedWorks().length === 0 ? <EmptyState text="暂无已结束的事项" /> : null}
    </View> : null}
  </>;
}
function WorkListCard(props: { work: Work }) {
  return <ActivityCard
    title={props.work.title}
    statusIndicator={infoPanelOpen() && props.work.phase === "running" ? <PulsingDots testID={`work-${props.work.id}-running`} /> : null}
    onPress={() => openWorkDetail(props.work.id)}
    accessibilityLabel={`查看事项 ${props.work.title}，${phaseLabels[props.work.phase]}`}
    testID={`work-${props.work.id}`}
  />;
}
function Library() {
  const artifacts = () => runtime().artifacts.filter((a) => currentWorks().some((w) => w.id === a.workId));
  return <>
    <Memories />
    <SectionLabel title={`${currentBot().name} 保存的资料`} />
    <Each of={artifacts()} key={(a) => a.id}>{(artifact) => <ArtifactCard artifact={artifact()} />}</Each>
    {artifacts().length === 0 ? <EmptyState text="还没有资料，工作产物会出现在这里" /> : null}
  </>;
}
/** The current bot's long-term memories and a row to add one. */
function Memories() {
  const text = signal("");
  const memories = () => runtime().memories.filter((m) => m.botId === currentBot().id);
  const add = () => { if (!text().trim()) return; command({ type: "memory.upsert", memory: { id: `memory-${requestId()}`, botId: currentBot().id, text: text().trim(), revision: 1, sourceMessageIds: [] } }); text.set(""); };
  return <>
    <SectionLabel title={`${currentBot().name} 记住的事`} first />
    <View class="w-full min-w-0 self-stretch gap-2" testID="memories">
      <Each of={memories()} key={(m) => m.id}>{(memory) => <ActionRow
        title={memory().text.replace(/\s*\n\s*/g, " ")}
        accessibilityLabel={`预览记忆 ${memory().text}`}
        testID={`library-memory-${memory().id}`}
        onPress={() => openLibraryPreview({ kind: "memory", item: memory() })}
      />}</Each>
      {memories().length === 0 ? <EmptyState text="还没有长期记忆，可以在下面添加或在聊天里交代" /> : null}
      <View class="flex-row items-center gap-2">
        <View class="min-w-0 flex-1"><TextField value={text()} onChange={(v) => text.set(v)} onSubmit={add} accessibilityLabel="新记忆" placeholder="希望 Bot 长期记住的事实" testID="memory-input" /></View>
        <IconButton icon="plus" label="记住" disabled={!text().trim()} onPress={add} testID="memory-add" />
      </View>
    </View>
  </>;
}
