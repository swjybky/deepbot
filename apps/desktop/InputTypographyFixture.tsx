/** Native input regression fixture; never imported by the production app. */
import { mount, signal, Text, View } from "nsh";
import { isAvailable, Window } from "nsh/desktop";
import { MessageInput } from "./ui/components/MessageInput";
import { TextField } from "./ui/components/TextField";

const sample = "消息 记忆 回复 息";

function InputTypography() {
  const field = signal(sample);
  const emptyField = signal("");
  const message = signal(sample);
  const emptyMessage = signal("");
  const submitted = signal("");
  return <View class="flex-1 gap-3 bg-background p-6">
    <Text class="text-title text-foreground">输入框字形诊断</Text>
    <Text class="text-body text-foreground">14 号文字对照：消息 记忆 回复 息</Text>
    <TextField value={field()} onChange={(value) => field.set(value)} accessibilityLabel="表单输入文字" testID="field-entered" />
    <TextField value={emptyField()} onChange={(value) => emptyField.set(value)} placeholder={sample} accessibilityLabel="表单占位文字" testID="field-placeholder" />
    <Text class="text-message text-foreground">15 号文字对照：消息 记忆 回复 息</Text>
    <View testID="message-entered" class="h-12 flex-row items-center rounded-full border border-input bg-card px-2">
      <MessageInput value={message()} onChange={(value) => message.set(value)} placeholder={sample} onSubmit={() => { submitted.set(message()); message.set(""); }} />
    </View>
    <View testID="message-placeholder" class="h-12 flex-row items-center rounded-full border border-input bg-card px-2">
      <MessageInput value={emptyMessage()} onChange={(value) => emptyMessage.set(value)} placeholder={sample} onSubmit={() => emptyMessage.set("")} />
    </View>
    <Text class="text-caption text-muted-foreground">可直接输入、删除；消息框回车后清空</Text>
    <Text testID="submitted" class="text-body text-foreground">{submitted()}</Text>
  </View>;
}

if (isAvailable) {
  Window.setTitle("DeepBot 输入框字形诊断 · 原生补丁");
  Window.setFrame({ size: { width: 800, height: 600 } });
  Window.orderFront();
}
mount(InputTypography);
