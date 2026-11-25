import { AlertDialog } from "nsh/base";
import { effect, signal, untracked, Text, View } from "nsh";
import { Button, Card, DisclosureRow, EmptyState } from "../../../components";
import { command, requestId, requestPending, requestStatus, runtime, type ModelConfig } from "../../../state/runtime";
import { ModelEditor } from "../models/ModelEditor";
import { apiOptions, providerName } from "../models/model-options";
import { notify } from "../../../state/feedback";

type Editor = { id: string; original?: ModelConfig };
export function ModelSettings() {
  const editor = signal<Editor | null>(null);
  const expanded = signal<string[]>([]);
  const pending = signal<{ id: string; closeEditor: boolean; deleted: boolean } | null>(null);
  const tests = signal<Record<string, string>>({});
  const groups = () => [...new Set(runtime().modelConfigs.map(c => c.provider))].map(provider => ({ provider, name: providerName(provider), models: runtime().modelConfigs.filter(c => c.provider === provider) }));
  const isOpen = (provider: string) => expanded().includes(provider);
  const expand = (provider: string) => { if (!isOpen(provider)) expanded.set([...expanded(), provider]); };
  const toggle = (provider: string) => expanded.set(isOpen(provider) ? expanded().filter(p => p !== provider) : [...expanded(), provider]);
  const mutate = (id: string, closeEditor = false, deleted = false) => { pending.set({ id, closeEditor, deleted }); };
  effect(() => {
    const operation = pending(); if (!operation) return;
    const status = requestStatus(operation.id)?.status;
    if (status === "failed" || status === "succeeded") untracked(() => {
      if (status === "succeeded" && operation.closeEditor) editor.set(null);
      if (status === "succeeded" && operation.deleted) notify("success", "模型配置已删除");
      pending.set(null);
    });
  });
  const open = (original?: ModelConfig) => {
    if (original) expand(original.provider);
    editor.set({ id: original?.id ?? `model-${requestId()}`, ...(original ? { original } : {}) });
  };
  const save = (config: Omit<ModelConfig, "hasApiKey">, apiKey: string, models?: string[]) => {
    expand(config.provider);
    const auth = apiKey ? { apiKey } : {};
    if (models) {
      const { name: _name, model: _model, ...connection } = config;
      mutate(command({ type: "model.add-many", config: connection, models, ...auth }), true);
    } else {
      mutate(command({ type: "model.upsert", config, ...auth }), true);
    }
  };
  const remove = async (config: ModelConfig) => {
    const reasons: string[] = [];
    if (config.id === runtime().defaultModelConfigId) reasons.push(runtime().modelConfigs.length < 2
      ? "这是唯一的模型配置，请先添加其他模型并设为默认"
      : "这是默认模型，请先将其他模型设为默认");
    const bots = runtime().bots.filter(b => b.modelConfigId === config.id);
    if (bots.length) reasons.push(`正在被 ${bots.map(b => `「${b.name}」`).join("、")} 使用，请选中对应 Bot，在右侧「配置」中切换模型`);
    if (runtime().assignments.some(a => a.state !== "ended" && a.brief.modelConfigId === config.id)) reasons.push("模型正在被运行事项使用，请先结束相关事项");
    if (reasons.length) { notify("warning", `${reasons.join("；")}后再删除`); return; }
    const result = await AlertDialog.show({ title: "删除模型配置", description: `删除「${config.name}」`, actions: [{ id: "cancel", label: "取消", role: "cancel" }, { id: "delete", label: "删除", role: "destructive" }] });
    if (result.action === "delete") mutate(command({ type: "model.delete", modelConfigId: config.id }), false, true);
  };
  const test = (config: ModelConfig) => tests.set({ ...tests(), [config.id]: command({ type: "model.test", config: { id: config.id } }) });
  const busyTest = (id: string) => requestPending(tests()[id] ?? "");
  return <View class="gap-4" testID="model-settings">
    <Text class="text-label text-muted-foreground">统一管理 Bot 使用的模型，新建 Bot 默认使用标为默认的配置</Text>
    <Card>
      <View class="mb-2 flex-row items-center justify-between gap-3">
        <Text class="min-w-0 flex-1 text-caption text-muted-foreground" testID="model-summary">{groups().length} 个提供方 · {runtime().modelConfigs.length} 个模型</Text>
        <Button label="添加模型" variant={editor() ? "secondary" : "primary"} size="sm" onPress={() => open()} disabled={!!editor() || !!pending()} testID="model-add" />
      </View>
      {runtime().modelConfigs.length === 0 ? <EmptyState text="还没有模型配置，添加后可供 Bot 选择" /> : null}
      <View>
      <Each of={groups()} key={g => g.provider}>{(group) => <View class="border-b border-divider">
        <DisclosureRow title={group().name} detail={`${group().models.length} 个模型`} icon="model" open={isOpen(group().provider)} onPress={() => toggle(group().provider)} testID={`model-group-${group().provider}`} />
        <View class="min-w-0 self-stretch mb-3 ml-4 flex-col gap-1 border-l border-border pl-4" style={{ display: isOpen(group().provider) ? "flex" : "none" }}>
          <Each of={group().models} key={c => c.id}>{(model) => <View class="min-w-0 self-stretch gap-2 py-3" testID={`model-card-${model().id}`}>
            {editor()?.id === model().id ? <ModelEditor id={editor()!.id} original={editor()!.original} saving={!!pending()} onSave={save} onCancel={() => { editor.set(null); }} /> : <>
              <View class="flex-row items-center gap-2">
                <Text class="min-w-0 flex-1 text-body font-medium text-foreground">{model().name}</Text>
                {model().id === runtime().defaultModelConfigId ? <Text class="rounded-full bg-chip px-2 py-0.5 text-caption text-muted-foreground">默认</Text> : null}
              </View>
              <Text class="text-caption text-muted-foreground">{model().model} · {apiOptions.find(a => a.value === model().api)?.title ?? model().api}</Text>
              <Text class="text-caption text-faint-foreground">{model().useCodexAuth ? "本机 Codex 登录" : model().hasApiKey ? "已配置密钥" : model().apiKeyEnv ? `使用环境变量 ${model().apiKeyEnv}` : "未配置密钥"}</Text>
              <View class="flex-row flex-wrap items-center gap-1">
                <Button label={model().id === runtime().defaultModelConfigId ? "默认模型" : "设为默认"} size="sm" variant="ghost" disabled={model().id === runtime().defaultModelConfigId || !!pending() || !!editor()} onPress={() => mutate(command({ type: "model.default", modelConfigId: model().id }))} testID={`model-default-${model().id}`} />
                <Button label="编辑" size="sm" variant="ghost" onPress={() => open(model())} disabled={!!pending() || !!editor()} testID={`model-edit-${model().id}`} />
                <Button label={busyTest(model().id) ? "测试中" : "测试连接"} size="sm" variant="ghost" disabled={busyTest(model().id)} onPress={() => test(model())} testID={`model-test-${model().id}`} />
                <Button label="删除" size="sm" variant="ghost" disabled={!!pending() || !!editor()} onPress={() => { void remove(model()); }} testID={`model-delete-${model().id}`} />
              </View>
            </>}
          </View>}</Each>
        </View>
      </View>}</Each>
      </View>
      <If when={editor() && !editor()!.original ? editor() : null}>{(value) => <ModelEditor id={value().id} saving={!!pending()} onSave={save} onCancel={() => { editor.set(null); }} />}</If>
    </Card>
  </View>;
}
