import { effect, signal, Text, untracked, View } from "nsh";
import { Button, FormField, Group, ListRow, MultiSelectField, SectionLabel, Switch, TextField } from "../../../components";
import { dismissFeedback, notify } from "../../../state/feedback";
import { canSend, command, requestPending, requestStatus, runtime, type ConnectorStatus } from "../../../state/runtime";

export function McpEditor(props: { connector: ConnectorStatus | undefined; onClose: () => void }) {
  const name = signal(props.connector?.name ?? "");
  const url = signal("");
  const token = signal("");
  const clearToken = signal(false);
  const botIds = signal([...props.connector?.mcp?.botIds ?? []]);
  const allowNewBots = signal(props.connector?.mcp?.allowNewBots ?? false);
  const request = signal("");
  const action = signal<"save" | "disconnect" | "reconnect">("save");
  const pending = () => requestPending(request());
  const canSave = () => canSend() && !pending() && !!name().trim() && (!!props.connector || !!url().trim());
  const bots = () => runtime().bots;
  const botLabel = (id: string) => {
    const bot = bots().find(item => item.id === id);
    if (!bot) return "已移除的 Bot";
    const duplicate = bots().some(item => item.id !== id && item.name === bot.name);
    return `${bot.name}${bot.hidden ? "（已隐藏）" : ""}${duplicate ? ` · ${id.slice(-8)}` : ""}`;
  };
  const close = () => {
    if (requestStatus(request())?.status === "failed") dismissFeedback(request());
    props.onClose();
  };
  const save = () => {
    if (!canSave()) return;
    dismissFeedback(request());
    action.set("save");
    request.set(command({
      type: "connector.mcp.save", name: name().trim(),
      ...(props.connector ? { connectorId: props.connector.id } : {}),
      ...(url().trim() ? { url: url().trim() } : {}),
      ...(clearToken() ? { token: "" } : token().trim() ? { token: token().trim() } : {}),
      access: { botIds: botIds().filter(id => bots().some(bot => bot.id === id)), allowNewBots: allowNewBots() },
    }));
  };
  const connect = (enabled: boolean) => {
    const connector = props.connector;
    if (!connector || !canSend() || pending()) return;
    dismissFeedback(request());
    action.set(enabled ? "reconnect" : "disconnect");
    request.set(command({ type: "connector.mcp.connect", connectorId: connector.id, enabled }));
  };
  effect(() => {
    const id = request();
    if (id && requestStatus(id)?.status === "succeeded") untracked(() => {
      notify("success", action() === "save" ? "连接器已保存" : action() === "disconnect" ? "连接器已断开" : "连接器已重连", id);
      props.onClose();
    });
  });

  return <>
    <SectionLabel title={props.connector ? "管理连接器" : "添加连接器"} first />
    <Group>
      <View class="w-full gap-3 px-[18px] py-2.5" testID="mcp-editor">
        <FormField label="名称">
          <TextField value={name()} onChange={value => name.set(value)} accessibilityLabel="连接器名称" maxLength={80}
            readonly={pending()} testID="mcp-name" />
        </FormField>
        {props.connector?.mcp?.kind === "stdio" ? null : <>
          <FormField label="HTTP MCP 地址">
            <TextField value={url()} onChange={value => url.set(value)} accessibilityLabel="HTTP MCP 地址"
              placeholder={props.connector ? "留空沿用已保存地址" : "https://服务地址/mcp"}
              readonly={pending()} testID="mcp-url" />
          </FormField>
          <FormField label="Bearer 令牌（选填）">
            <TextField value={token()} onChange={value => token.set(value)} accessibilityLabel="Bearer 令牌"
              placeholder={props.connector?.mcp?.hasCredential ? "留空沿用同一地址的凭据" : "输入令牌"}
              readonly={pending() || clearToken()} masked testID="mcp-token" />
          </FormField>
          {props.connector?.mcp?.hasCredential ? <ListRow title="移除 Bearer 令牌"
            trailing={<Switch label="移除 Bearer 令牌" checked={clearToken()} onChange={value => clearToken.set(value)} disabled={pending()} />} /> : null}
        </>}
        <FormField label="已有 Bot">
          <MultiSelectField options={bots().map(bot => bot.id)} value={botIds()} onChange={value => botIds.set(value)}
            optionLabel={botLabel} accessibilityLabel="已有 Bot" placeholder="未授权任何 Bot" searchLabel="搜索 Bot"
            emptyLabel="暂无匹配的 Bot" selectedLabel={count => `已选 ${count} 个 Bot`} disabled={pending()} testID="mcp-bots" />
        </FormField>
        <View class="flex-row items-center justify-between gap-3">
          <View class="flex-1 gap-0.5">
            <Text class="text-body text-foreground">新建 Bot 默认可用</Text>
            <Text class="text-caption text-muted-foreground">仅影响之后创建的 Bot</Text>
          </View>
          <Switch label="新建 Bot 默认可用" checked={allowNewBots()} onChange={value => allowNewBots.set(value)} disabled={pending()} />
        </View>
        <Text class="text-caption text-muted-foreground">已授权的 Bot 可使用服务凭据调用工具，操作权限由服务决定</Text>
        <View class="flex-row justify-end gap-2">
          {props.connector ? <Button size="sm" label={props.connector.available ? "断开" : "重连"}
            disabled={pending() || !canSend()} onPress={() => connect(!props.connector?.available)} testID="mcp-connect" /> : null}
          <Button size="sm" label="取消" disabled={pending()} onPress={close} testID="mcp-cancel" />
          <Button size="sm" variant="primary" label={pending() ? "处理中" : props.connector ? "保存" : "添加并连接"}
            disabled={!canSave()} onPress={save} testID="mcp-save" />
        </View>
      </View>
    </Group>
  </>;
}
