import { computed, effect, signal, untracked, Text, View, type ViewProps } from "nsh";
import { Button, FormField, FormRow, MultiSelectField, SelectField, Switch, TextField } from "../../../components";
import { command, modelRequestResult, runtime, type ModelConfig } from "../../../state/runtime";
import { apiOptions, inputOptions, providerPresets } from "./model-options";

type Config = Omit<ModelConfig, "hasApiKey">;
export function ModelEditor(props: { onLayout?: ViewProps["onLayout"]; id: string; original?: ModelConfig | undefined; saving: boolean; onSave: (config: Config, apiKey: string, models?: string[]) => void; onCancel: () => void }) {
  const draft = signal<Config>(props.original ? { ...props.original } : { id: props.id, name: "", provider: "openai", model: "", api: "openai-responses", baseUrl: "https://api.openai.com/v1", apiKeyEnv: "OPENAI_API_KEY", useCodexAuth: false });
  const key = signal("");
  const advanced = signal(false);
  const listing = signal("");
  const testing = signal("");
  const remote = signal<string[]>([]);
  const selected = signal<string[]>([]);
  const choosingRemote = computed(() => remote().length > 0);
  const canMultiSelect = computed(() => !props.original && !draft().name.trim());
  const setName = (name: string) => {
    draft.set({ ...draft(), name });
    if (name.trim() && selected().length > 1) selected.set(selected().slice(0, 1));
  };
  const clearRemote = () => {
    if (!choosingRemote()) return;
    draft.set({ ...draft(), model: selected()[0] ?? draft().model });
    remote.set([]);
    selected.set([]);
  };
  const resetConnection = () => { clearRemote(); listing.set(""); testing.set(""); };
  const patch = (value: Partial<Config>) => {
    resetConnection();
    const current = draft();
    const identityChanged = (value.provider !== undefined && value.provider.trim() !== current.provider.trim())
      || (value.model !== undefined && value.model.trim() !== current.model.trim());
    draft.set({ ...current, ...value, ...(identityChanged ? { inputMode: "auto" } : {}) });
  };
  const selectModels = (models: string[]) => {
    const previous = selected();
    if (models.length !== previous.length || models.some((model, index) => model !== previous[index])) {
      draft.set({ ...draft(), inputMode: "auto" });
    }
    selected.set(models);
  };
  const providers = () => [...providerPresets, ...[...new Set([...runtime().modelConfigs.map(c => c.provider), draft().provider])].filter(p => !providerPresets.some(o => o.value === p)).map(value => ({ value, title: value }))];
  const setProvider = (provider: string) => {
    const preset = providerPresets.find(p => p.value === provider);
    patch({ provider, ...(preset ? { api: preset.api, baseUrl: preset.baseUrl, apiKeyEnv: preset.apiKeyEnv } : {}), useCodexAuth: provider === "openai-codex", model: "" });
    key.set("");
  };
  const model = () => choosingRemote() ? selected()[0] ?? "" : draft().model.trim();
  const valid = () => !!draft().provider.trim() && !!model();
  const batch = () => canMultiSelect() && selected().length > 1;
  const busy = () => !!testing() || !!listing() || props.saving;
  const config = (): Config => ({ id: draft().id, api: draft().api, useCodexAuth: draft().useCodexAuth, name: draft().name.trim() || model(), provider: draft().provider.trim(), model: model(), baseUrl: draft().baseUrl.trim(), apiKeyEnv: draft().apiKeyEnv.trim(), inputMode: draft().inputMode ?? "auto" });
  const keyPlaceholder = () => {
    if (props.original?.hasApiKey && props.original.provider === draft().provider) return "已配置，留空保留原密钥";
    return draft().provider === "magpie" ? "本机网关可留空，远程网关填写密钥" : "填写 API Key，或在高级设置中使用环境变量";
  };
  const query = (type: "model.list" | "model.test") => {
    const id = command({ type, config: config(), ...(key().trim() ? { apiKey: key().trim() } : {}) });
    if (type === "model.list") listing.set(id); else testing.set(id);
  };
  effect(() => {
    const id = listing(); const result = modelRequestResult(id);
    if (id && result) untracked(() => {
      const models = [...new Set((result.models ?? []).map(model => model.trim()).filter(Boolean))];
      if (models.length) {
        const previous = choosingRemote() ? selected() : [draft().model.trim()];
        selected.set(previous.filter(model => models.includes(model)));
        remote.set(models);
      } else if (result.ok) clearRemote();
      listing.set("");
    });
  });
  effect(() => {
    if (testing() && modelRequestResult(testing())) untracked(() => { testing.set(""); });
  });
  return <View class="w-full min-w-0 self-stretch gap-4 rounded-card border border-border bg-secondary p-4" testID="model-editor" onLayout={props.onLayout}>
    <View class="flex-row items-center justify-between gap-3">
      <Text class="text-body font-semibold text-foreground">{props.original ? "编辑模型" : "添加模型"}</Text>
      <Button label="取消" variant="ghost" size="sm" onPress={props.onCancel} disabled={props.saving} testID="model-editor-cancel" />
    </View>
    <FormRow>
      <FormField label="名称"><TextField value={draft().name} onChange={setName} placeholder={props.original ? "留空使用模型 ID" : "留空可多选模型"} accessibilityLabel="模型名称" testID="model-name" /></FormField>
      <FormField label="提供方"><SelectField form value={draft().provider} options={providers()} onChange={setProvider} accessibilityLabel="模型提供方" testID="model-provider" /></FormField>
    </FormRow>
    <FormField label="模型 ID">
      <View class="flex-row items-center gap-2">
        <View class="min-w-0 flex-1">
          {choosingRemote() ? (canMultiSelect() ?
            <MultiSelectField options={remote()} value={selected()} onChange={selectModels}
              placeholder="选择模型" searchLabel="搜索模型" emptyLabel="没有匹配的模型"
              selectedLabel={count => `已选 ${count} 个模型`} accessibilityLabel="可用模型" disabled={busy()} testID="model-remote" /> :
            <SelectField form searchable value={model()} options={[{ value: "", title: "选择模型" }, ...remote().map(value => ({ value, title: value }))]}
              onChange={value => selectModels(value ? [value] : [])} disabled={busy()} accessibilityLabel="可用模型" testID="model-remote" />
          ) : <TextField value={draft().model} onChange={(model) => patch({ model })} placeholder="提供方给出的模型 ID" accessibilityLabel="模型 ID" testID="model-id" />}
        </View>
        <Button label={listing() ? "拉取中" : "拉取"} size="sm" onPress={() => query("model.list")} disabled={!!listing() || !!testing() || props.saving} testID="model-fetch" />
      </View>
      {choosingRemote() ? <View class="flex-row"><Button label="手动填写" size="sm" variant="ghost" onPress={clearRemote} testID="model-manual" /></View> : null}
    </FormField>
    <FormRow>
      <FormField label="API 类型"><SelectField form value={draft().api} options={apiOptions} onChange={(api) => patch({ api })} accessibilityLabel="模型 API 类型" testID="model-api" /></FormField>
      <FormField label="输入能力"><SelectField form value={draft().inputMode ?? "auto"} options={inputOptions} onChange={value => {
        const mode = inputOptions.find(option => option.value === value)?.value;
        if (mode) draft.set({ ...draft(), inputMode: mode });
      }} accessibilityLabel="输入能力" testID="model-input-mode" /></FormField>
    </FormRow>
    <FormField label="API 地址"><TextField value={draft().baseUrl} onChange={(baseUrl) => patch({ baseUrl })} placeholder="内置模型可留空，自定义服务填写完整地址" accessibilityLabel="模型 API 地址" testID="model-url" /></FormField>
    {draft().useCodexAuth ? <Text class="text-caption text-muted-foreground">使用本机 Codex 登录，无需填写 API Key</Text> : <FormField label="API Key"><TextField value={key()} onChange={(v) => { key.set(v); resetConnection(); }} masked placeholder={keyPlaceholder()} accessibilityLabel="模型 API Key" testID="model-key" /></FormField>}
    <View class="flex-row"><Button label={advanced() ? "收起高级设置" : "高级设置"} size="sm" variant="ghost" onPress={() => advanced.set(!advanced())} testID="model-advanced" /></View>
    {advanced() ? <View class="gap-3">
      <FormRow>
        <FormField label="提供方标识"><TextField value={draft().provider} onChange={(provider) => patch({ provider })} accessibilityLabel="提供方标识" testID="model-provider-id" /></FormField>
        <FormField label="密钥环境变量"><TextField value={draft().apiKeyEnv} onChange={(apiKeyEnv) => patch({ apiKeyEnv })} accessibilityLabel="密钥环境变量" testID="model-env" /></FormField>
      </FormRow>
      {draft().provider === "openai-codex" ? <View class="flex-row items-center justify-between"><Text class="text-label text-foreground">使用本机 Codex 登录</Text><Switch checked={draft().useCodexAuth} onChange={(useCodexAuth) => patch({ useCodexAuth })} label="使用本机 Codex 登录" /></View> : null}
    </View> : null}
    <View class="flex-row items-center justify-between gap-3">
      <Button label={testing() ? "测试中" : "测试连接"} size="sm" onPress={() => query("model.test")} disabled={!valid() || batch() || busy()} testID="model-test" />
      <Button label={props.saving ? "保存中" : props.original ? "保存修改" : batch() ? `添加 ${selected().length} 个模型` : "添加模型"}
        variant="primary" size="sm" onPress={() => props.onSave(config(), key().trim(), batch() ? selected() : undefined)}
        disabled={!valid() || busy()} testID="model-save" />
    </View>
  </View>;
}
