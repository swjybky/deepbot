import { effect, signal, Text, untracked, View } from "nsh";
import { Button, FormField, Group, SectionLabel, SelectField, TextField } from "../../../components";
import { dismissFeedback, notify } from "../../../state/feedback";
import { canSend, command, requestPending, requestStatus, type ConnectorStatus, type T3RuntimeMode } from "../../../state/runtime";

export const t3Modes = [
  { value: "full-access", title: "完全访问" },
  { value: "auto", title: "自动" },
  { value: "auto-accept-edits", title: "自动批准编辑" },
  { value: "approval-required", title: "逐次审批" },
] satisfies { value: T3RuntimeMode; title: string }[];
export const t3ModeLabel = (mode: T3RuntimeMode) => t3Modes.find(option => option.value === mode)?.title ?? mode;

export function RemoteT3Editor(props: { connector?: ConnectorStatus | undefined; onClose: () => void }) {
  const name = signal(props.connector?.name ?? "");
  const url = signal(props.connector?.remoteT3?.url ?? "");
  const token = signal("");
  const approval = signal("");
  const mode = signal<T3RuntimeMode>(props.connector?.t3?.runtimeMode ?? "approval-required");
  const request = signal("");
  const result = signal("");
  const pending = () => requestPending(request());
  const sameAddress = () => url().trim() === props.connector?.remoteT3?.url;
  const canSave = () => canSend() && !pending() && !!name().trim() && !!url().trim() && (sameAddress() || !!token().trim());
  const save = () => {
    if (!canSave()) return;
    dismissFeedback(request());
    result.set("执行器已保存");
    request.set(command({
      type: "connector.t3.save", name: name().trim(), url: url().trim(), runtimeMode: mode(),
      ...(props.connector ? { connectorId: props.connector.id } : {}),
      ...(token().trim() ? { token: token().trim() } : {}),
      ...(approval().trim() ? { approvalCredential: approval().trim() } : {}),
    }));
  };
  const connect = (enabled: boolean) => {
    if (!props.connector || !canSend() || pending()) return;
    dismissFeedback(request());
    result.set(enabled ? "执行器已重连" : "执行器已断开");
    request.set(command({ type: "connector.t3.connect", connectorId: props.connector.id, enabled }));
  };
  effect(() => {
    const id = request();
    if (requestStatus(id)?.status === "succeeded") untracked(() => {
      notify("success", result(), id);
      props.onClose();
    });
  });

  return <>
    <SectionLabel title={props.connector ? "管理远端 T3 Code" : "添加远端 T3 Code"} first />
    <Group>
      <View class="w-full gap-3 px-[18px] py-2.5" testID="remote-t3-editor">
        <FormField label="名称">
          <TextField value={name()} onChange={value => name.set(value)} accessibilityLabel="执行器名称" maxLength={80}
            readonly={pending()} testID="remote-t3-name" />
        </FormField>
        <FormField label="T3 Code 地址">
          <TextField value={url()} onChange={value => url.set(value)} accessibilityLabel="T3 Code 地址"
            placeholder="https://环境地址/mcp" readonly={pending()} testID="remote-t3-url" />
        </FormField>
        <FormField label="派活连接">
          <TextField value={token()} onChange={value => token.set(value)} accessibilityLabel="派活连接凭据"
            placeholder={sameAddress() ? "留空沿用已保存凭据" : "粘贴配对链接、配对码或 MCP 密钥"}
            masked readonly={pending()} testID="remote-t3-token" />
        </FormField>
        <FormField label="新派工权限">
          <SelectField form accessibilityLabel="新派工权限" options={t3Modes} value={mode()}
            onChange={value => mode.set(value as T3RuntimeMode)} disabled={pending()} testID="remote-t3-mode" />
        </FormField>
        <FormField label="审批连接（选填）">
          <TextField value={approval()} onChange={value => approval.set(value)} accessibilityLabel="审批连接凭据"
            placeholder={sameAddress() && props.connector?.remoteT3?.hasApprovalCredential ? "留空沿用已保存凭据" : "粘贴设备配对链接、配对码或审批密钥"}
            masked readonly={pending()} testID="remote-t3-approval" />
        </FormField>
        {/^http:/i.test(url().trim()) ? <Text class="text-label text-muted-foreground" testID="remote-t3-http-notice">
          HTTP 会明文传输派活凭据，请仅在可信网络使用。审批连接需使用 HTTPS 或本机回环地址。
        </Text> : null}
        <View class="flex-row justify-end gap-2">
          {props.connector && !props.connector.available
            ? <Button size="sm" label="重连" disabled={pending() || !canSend()} onPress={() => connect(true)} testID="remote-t3-reconnect" /> : null}
          {props.connector?.remoteT3?.enabled
            ? <Button size="sm" label="断开" disabled={pending() || !canSend()} onPress={() => connect(false)} testID="remote-t3-disconnect" /> : null}
          <Button size="sm" label="取消" disabled={pending()} onPress={() => { dismissFeedback(request()); props.onClose(); }} testID="remote-t3-cancel" />
          <Button size="sm" variant="primary" disabled={!canSave()} onPress={save} testID="remote-t3-save"
            label={pending() ? "处理中" : props.connector ? "保存并连接" : "添加并连接"} />
        </View>
      </View>
    </Group>
  </>;
}
