import { computed, effect, Scroll, signal, untracked, View, windowSize } from "nsh";
import { ActivityCard, Button, ChoiceCard, EmptyState, FormField, Group, IconButton, ListRow, Modal, ModalHeader, SectionLabel, SelectField } from "../../components";
import { T3ThreadButtons } from "../../components/T3ThreadButtons";
import { currentWorks } from "../../state/bots";
import { assigneeOptions, cancelWork, phaseLabels, queryT3Projects, reassignWork, requestPending, requestStatus, runtime, type Artifact, type Work } from "../../state/runtime";
import { closeModal, modal, workDetailId } from "../../state/ui";
import { ArtifactCard } from "./ArtifactCard";
import { ArtifactPreview } from "./LibraryPreviewDialog";

export function WorkDetailDialog() {
  const selected = () => modal() === "workDetail" ? currentWorks().find((work) => work.id === workDetailId()) : undefined;
  return <Modal
    open={!!selected()}
    onClose={closeModal}
    width={Math.min(760, windowSize().width - 32)}
    height={Math.min(640, windowSize().height - 32)}
    animation="none"
    testID="work-detail-dialog"
  >
    <If when={selected()}>{(work) => <WorkDetail work={work()} />}</If>
  </Modal>;
}

/** One work opened from the activity list: what it is for, who runs it, what it produced. */
function WorkDetail(props: { work: Work }) {
  const assignment = () => runtime().assignments.find((a) => a.id === props.work.assignmentId);
  const assigneeName = () => assigneeOptions().find((o) => o.value === assignment()?.assignee)?.title ?? assignment()?.assignee ?? "等待派工";
  const target = signal("");
  const query = signal("");
  const reassignment = signal("");
  const updateAssignee = (id: string) => {
    if (id === assignment()?.assignee) { target.set(""); return; }
    if (runtime().connectors.some(c => c.id === id && c.remoteT3)) {
      target.set(id);
      query.set(queryT3Projects(id));
      return;
    }
    target.set("");
    reassignment.set(reassignWork(props.work.id, id));
  };
  const projects = () => {
    const result = requestStatus(query());
    return result?.status === "succeeded" ? result.projects : undefined;
  };
  effect(() => {
    if (requestStatus(reassignment())?.status === "succeeded") untracked(() => target.set(""));
  });
  const artifacts = () => runtime().artifacts.filter((a) => a.workId === props.work.id);
  const externalRequests = () => runtime().attentions.filter(request => request.workId === props.work.id &&
    request.assignmentId === props.work.assignmentId && request.state === "open" && request.remoteRequest?.kind === "external");
  const preview = signal<Artifact | null>(null);
  const canReassign = computed(() => props.work.state === "open");
  const showStop = computed(() => !preview() && props.work.state !== "ended");
  const summary = () => [props.work.goal, "", "验收标准", ...props.work.criteria.map((c) => `· ${c}`)].join("\n");
  return <>
    <ModalHeader title={preview()?.name ?? "事项详情"} onClose={closeModal} actions={
      showStop()
        ? <IconButton icon="stop" label="停止事项" onPress={() => cancelWork(props.work.id)} testID={`cancel-work-${props.work.id}`} />
        : null
    } />
    <If when={preview()}>{(artifact) => <>
      <View class="items-start px-6 pt-3">
        <IconButton icon="arrowLeft" label="返回事项" onPress={() => preview.set(null)} testID="work-preview-back" />
      </View>
      <ArtifactPreview artifact={artifact()} />
    </>}</If>
    {!preview() ? <Scroll class="min-h-0 flex-1" contentClass="gap-3 px-6 py-5" testID="work-detail-content">
    <ActivityCard title={props.work.title} status={phaseLabels[props.work.phase]} detail={summary()} testID={`work-detail-${props.work.id}`} />
    <SectionLabel title="执行" />
    <Group density="compact">
      <ListRow title="派活对象" description={assigneeName()} trailing={canReassign()
        ? <SelectField size="sm" accessibilityLabel={`改派 ${props.work.title}`} value={target() || assignment()?.assignee || "self"} options={assigneeOptions()}
            disabled={requestPending(reassignment())} onChange={updateAssignee} testID="work-assignee" /> : null} />
      {target() && canReassign() ? <View class="gap-2 px-[18px] py-2.5">
        {projects()?.length ? <FormField label="远端项目">
          <SelectField form accessibilityLabel="选择项目并改派" value="" options={[{ value: "", title: "选择项目并改派", disabled: true },
            ...projects()!.map(project => ({ value: project.id, title: project.title ? `${project.title} · ${project.workspaceRoot}` : project.workspaceRoot }))]}
            disabled={requestPending(reassignment())} onChange={id => reassignment.set(reassignWork(props.work.id, target(), id))} testID="work-remote-project" />
        </FormField> : <ListRow title={requestPending(query()) ? "正在查询项目" : projects() ? "此执行器暂无项目" : "项目查询失败"} />}
        <View class="flex-row justify-end gap-2">
          {requestStatus(query())?.status === "failed" ? <Button size="sm" label="重试" onPress={() => query.set(queryT3Projects(target()))} /> : null}
          <Button size="sm" label="取消改派" disabled={requestPending(reassignment())} onPress={() => target.set("")} />
        </View>
      </View> : null}
      <ListRow title="目录" description={assignment()?.sessionRef?.remoteCwd ?? props.work.cwd} />
    </Group>
    <ActivityCard title="进度" status="" detail={props.work.progress || "等待派工"} testID={`work-progress-${props.work.id}`} />
    <Each of={externalRequests()} key={request => request.id}>{request => {
      const actions = <T3ThreadButtons attention={request()} />;
      return <ChoiceCard question={request().question} label="对方在等你" options={[]} allowOther={false} onChoose={() => {}} testID={`attention-${request().id}`}>{actions}</ChoiceCard>;
    }}</Each>
    <If when={props.work.botApprovals?.length ? props.work.botApprovals : null}>{(approvals) =>
      <ActivityCard title="Bot 已代批" status="" detail={approvals().join("\n")} testID={`work-approvals-${props.work.id}`} />
    }</If>
    <SectionLabel title="产物" />
    <Each of={artifacts()} key={(a) => a.id}>{(artifact) => <ArtifactCard artifact={artifact()} onPreview={(item) => preview.set(item)} />}</Each>
    {artifacts().length === 0 ? <EmptyState text="还没有产物，完成后会出现在这里" /> : null}
    </Scroll> : null}
  </>;
}
