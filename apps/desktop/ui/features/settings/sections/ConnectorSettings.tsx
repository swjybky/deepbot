import { effect, signal, untracked, View } from "nsh";
import { AddTileCard, Button, FormField, SectionLabel, SelectField, TextField, TileCard, TileGrid } from "../../../components";
import { dismissFeedback, notify } from "../../../state/feedback";
import { canSend, command, requestPending, requestStatus, runtime, type ConnectorStatus, type T3RuntimeMode } from "../../../state/runtime";
import { contextWindows, ExecutorSettings, thinkingLevels } from "./ExecutorSettings";
import { McpEditor } from "./McpEditor";
import { RemoteT3Editor, t3ModeLabel, t3Modes } from "./RemoteT3Editor";
import { modal } from "../../../state/ui";

function SelfTile(props: { expanded: boolean; onToggle: () => void }) {
  const executor = () => runtime().settings.executor;
  const info = () => [
    { label: "思考等级", value: thinkingLevels.find(option => option.value === executor().thinkingLevel)?.title ?? executor().thinkingLevel },
    { label: "上下文窗口", value: contextWindows.find(option => option.value === String(executor().contextWindow))?.title ?? String(executor().contextWindow) },
    { label: "图片输入 · 项目说明", value: `${executor().images ? "开" : "关"} · ${executor().projectInstructions ? "开" : "关"}` },
  ];
  return (
    <TileCard
      icon="model" title="Bot 自己" subtitle="内置执行器" status={{ online: true, label: "可用" }} testID="connector-self"
      info={props.expanded ? undefined : info()}
      footerNote={props.expanded ? "进行中的事项从下一次模型请求起生效" : undefined}
      actions={<Button size="sm" label={props.expanded ? "收起" : "配置"} onPress={props.onToggle} testID="self-configure" />}
    >
      {props.expanded ? <View class="w-full min-w-0"><ExecutorSettings /></View> : null}
    </TileCard>
  );
}

function ExecutorTiles(props: { selfExpanded: boolean; onToggleSelf: () => void; onEditRemote: (id: string) => void }) {
  const connectors = () => runtime().connectors;
  const t3 = () => connectors().find(connector => connector.id === "t3code");
  const acp = () => connectors().filter(connector => connector.transport === "acp");
  const remotes = () => connectors().filter(connector => connector.remoteT3);
  const editing = signal(false);
  const credential = signal("");
  const approvalCredential = signal("");
  const mode = signal<T3RuntimeMode>("full-access");
  const request = signal("");
  const settings = () => t3()?.t3;
  const savedMode = () => settings()?.runtimeMode ?? "full-access";
  const pending = () => requestPending(request());
  const canSave = () => canSend() && !pending() && (!!credential().trim() || !!approvalCredential().trim() || mode() !== savedMode());
  const closeEditor = () => {
    editing.set(false);
    credential.set("");
    approvalCredential.set("");
    if (!pending()) {
      if (requestStatus(request())?.status === "failed") dismissFeedback(request());
      request.set("");
    }
  };
  const save = () => {
    if (!canSave()) return;
    if (requestStatus(request())?.status === "failed") dismissFeedback(request());
    request.set(command({ type: "connector.t3.configure", runtimeMode: mode(),
      ...(credential().trim() ? { token: credential().trim() } : {}),
      ...(approvalCredential().trim() ? { approvalCredential: approvalCredential().trim() } : {}),
    }));
  };
  effect(() => {
    const id = request();
    if (requestStatus(id)?.status === "succeeded") untracked(() => {
      closeEditor();
      notify("success", "T3 Code 配置已保存", id);
    });
  });
  effect(() => {
    if (modal() !== "settings") untracked(closeEditor);
  });

  const info = () => {
    const granted = settings()?.grantedMode;
    return [
      { label: "新派工权限", value: `${t3ModeLabel(savedMode())}${granted && granted !== savedMode() ? ` · T3 已授权${t3ModeLabel(granted)}` : ""}`, testID: "t3-mode-status" },
      { label: "在 DeepBot 审批", value: settings()?.approvalAvailable ? "已连接" : settings()?.approvalReason ?? "未连接", testID: "t3-approval-status" },
    ];
  };
  const items = () => [
    { id: "self", wide: props.selfExpanded },
    ...(t3() ? [{ id: "t3code", wide: editing() }] : []),
    ...(acp().some(connector => connector.id === "acp:codex") ? [] : [{ id: "acp:codex" }]),
    ...acp().map(connector => ({ id: connector.id })),
    ...remotes().map(connector => ({ id: connector.id })),
    { id: "" },
  ];
  // The editor state belongs to the grid's owner because widening can move the tile to another row.
  const renderT3 = () => (
    <TileCard
      icon="terminal" title={t3()?.name ?? "T3 Code"} subtitle="代码执行器" testID="connector-t3code"
      status={{ online: !!t3()?.available, label: t3()?.available ? "可用" : "未连接" }}
      description={t3()?.available ? undefined : t3()?.reason}
      info={editing() ? undefined : info()}
      actions={editing() ? <>
        <Button size="sm" label="取消" disabled={pending()} onPress={closeEditor} testID="t3-token-cancel" />
        <Button size="sm" variant="primary" label={pending() ? "连接中" : "保存并连接"}
          disabled={!canSave()} onPress={save} testID="t3-token-save" />
      </> : <Button size="sm" label={pending() ? "连接中" : "配置连接"}
        disabled={pending()} onPress={() => { mode.set(savedMode()); editing.set(true); }} testID="t3-configure" />}
    >
      {editing() ? <View class="w-full min-w-0 gap-3" testID="t3-token-editor">
        <FormField label="新派工权限">
          <SelectField form accessibilityLabel="新派工权限" options={t3Modes} value={mode()} onChange={value => mode.set(value as T3RuntimeMode)} disabled={pending()} testID="t3-runtime-mode" />
        </FormField>
        <FormField label="派活连接">
          <TextField value={credential()} onChange={value => credential.set(value)} onSubmit={save}
            accessibilityLabel="T3 Code 配对链接、配对码或 MCP 密钥" placeholder="粘贴配对链接、配对码或 MCP 密钥"
            masked readonly={pending()} autoFocus testID="t3-token" />
        </FormField>
        <FormField label="审批连接">
          <TextField value={approvalCredential()} onChange={value => approvalCredential.set(value)} onSubmit={save}
            accessibilityLabel="T3 Code 审批设备配对链接或密钥" placeholder="粘贴设备配对链接或审批密钥"
            masked readonly={pending()} testID="t3-approval-token" />
        </FormField>
      </View> : null}
    </TileCard>
  );
  const renderItem = (id: string) => {
    if (!id) return <AddTileCard title="添加执行器" subtitle="远端 T3 Code" accessibilityLabel="添加执行器" testID="executor-add" onPress={() => props.onEditRemote("")} />;
    if (id === "self") return <SelfTile expanded={props.selfExpanded} onToggle={props.onToggleSelf} />;
    if (id === "t3code") return renderT3();
    const remote = () => remotes().find(entry => entry.id === id);
    if (remote()) return <RemoteT3Tile connector={remote()!} onManage={() => props.onEditRemote(id)} />;
    const connector = () => acp().find(entry => entry.id === id);
    const status = () => {
      const entry = connector();
      return { online: !!entry?.available, label: entry ? (entry.available ? "可派活" : "未连接") : "未检测到" };
    };
    return <TileCard icon="terminal" title={connector()?.name ?? "Codex ACP"} subtitle="ACP 执行器"
      status={status()} description={connector() ? (connector()?.available ? undefined : connector()?.reason) : "未检测到可用程序"}
      testID={`connector-${id}`} />;
  };
  return <TileGrid items={items()} renderItem={renderItem} testID="executor-grid" />;
}

function RemoteT3Tile(props: { connector: ConnectorStatus; onManage: () => void }) {
  const settings = () => props.connector.t3;
  const enabled = () => props.connector.remoteT3?.enabled;
  const mode = () => settings()?.runtimeMode ?? "approval-required";
  const grant = () => settings()?.grantedMode;
  return <TileCard icon="terminal" title={props.connector.name} subtitle="远端 T3 Code"
    status={{ online: props.connector.available, label: props.connector.available ? "可用" : enabled() ? "未连接" : "已断开" }}
    description={enabled() && !props.connector.available ? props.connector.reason : undefined}
    info={[
      { label: "新派工权限", value: `${t3ModeLabel(mode())}${grant() && grant() !== mode() ? ` · T3 已授权${t3ModeLabel(grant()!)}` : ""}` },
      { label: "在 DeepBot 审批", value: settings()?.approvalAvailable ? "已连接" : "未连接" },
    ]}
    testID={`connector-${props.connector.id}`}
    actions={<Button size="sm" label="管理" accessibilityLabel={`管理 ${props.connector.name}`} onPress={props.onManage} />}
  />;
}

function McpTile(props: { connector: ConnectorStatus; onManage: () => void }) {
  const botCount = () => props.connector.mcp?.botIds.length ?? 0;
  return <TileCard icon="plug" title={props.connector.name} subtitle={props.connector.mcp?.kind === "stdio" ? "stdio MCP" : "HTTP MCP"}
    status={{ online: props.connector.available, label: props.connector.available ? "已连接" : "未连接" }}
    description={props.connector.available ? undefined : props.connector.reason}
    info={[
      { label: "工具", value: `${props.connector.tools ?? 0} 个` },
      { label: "可用 Bot", value: botCount() ? `${botCount()} 个` : "未授权", testID: "mcp-bot-access" },
    ]}
    testID={`connector-${props.connector.id}`}
    actions={<Button size="sm" label="管理" accessibilityLabel={`管理 ${props.connector.name}`}
      onPress={props.onManage} testID={`mcp-manage-${props.connector.id}`} />}
  />;
}

export function ConnectionSettings() {
  const self = signal(false);
  const editor = signal<string | null>(null);
  const remoteEditor = signal<string | null>(null);
  const mcps = () => runtime().connectors.filter(connector => connector.mcp);
  const empty = () => !mcps().length;
  const renderMcp = (id: string) => {
    if (!id) return <AddTileCard title={empty() ? "暂无连接器" : "添加连接器"}
      subtitle={empty() ? "添加 HTTP MCP 服务" : "Streamable HTTP MCP"}
      accessibilityLabel={empty() ? "暂无连接器，添加连接器" : "添加连接器"}
      tooltip={empty() ? "添加连接器" : undefined} testID="mcp-add" onPress={() => editor.set("")} />;
    const connector = () => mcps().find(entry => entry.id === id);
    return <>{connector() ? <McpTile connector={connector()!} onManage={() => editor.set(id)} /> : null}</>;
  };
  effect(() => {
    if (modal() !== "settings") untracked(() => { self.set(false); editor.set(null); remoteEditor.set(null); });
  });

  return <>{editor() !== null
    ? <McpEditor connector={mcps().find(connector => connector.id === editor())} onClose={() => editor.set(null)} />
    : remoteEditor() !== null
      ? <RemoteT3Editor connector={runtime().connectors.find(connector => connector.id === remoteEditor())}
          onClose={() => remoteEditor.set(null)} />
      : <>
      <SectionLabel title="执行器" first />
      <ExecutorTiles selfExpanded={self()} onToggleSelf={() => self.set(!self())} onEditRemote={id => remoteEditor.set(id)} />
      <SectionLabel title="连接器" />
      <TileGrid items={[...mcps(), { id: "" }]} renderItem={renderMcp} testID="mcp-grid" />
    </>}</>;
}
