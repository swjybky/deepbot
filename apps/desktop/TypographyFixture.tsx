/** Typography regression fixture; never imported by the production app. */
import { mount, signal, Storage, Text, token, View, type TextLayoutLine } from "nsh";
import { isAvailable, Window } from "nsh/desktop";
import { Button } from "./ui/components/Button";
import { MessageInput } from "./ui/components/MessageInput";

const samples = ["caption", "meta", "label", "body", "message", "title", "heading"];
const metrics: Record<string, TextLayoutLine[]> = {};
const record = (id: string, lines: TextLayoutLine[]) => {
  metrics[id] = lines;
  void Storage.setItem("typography", JSON.stringify(metrics));
};

function Typography() {
  void Storage.setItem("typography-font", token("font-sans"));
  const draft = signal("");
  return <View class="flex-1 gap-2 bg-background p-6">
    {samples.map((name) => <View>
      <Text testID={`${name}-clamped`} class={`line-clamp-1 text-${name} text-foreground`} onTextLayout={({ lines }) => record(`${name}-clamped`, lines)}>
        消息 记忆 息 这台电脑 本机服务已连接 gjpq
      </Text>
      <Text testID={`${name}-multiline`} class={`text-${name} text-foreground`} onTextLayout={({ lines }) => record(`${name}-multiline`, lines)}>
        {"发送结果\n回复正文 消息 记忆 息 gjpq"}
      </Text>
    </View>)}
    <View class="h-12 flex-row items-center rounded-full border border-input bg-card px-2">
      <MessageInput value={draft()} onChange={(value) => draft.set(value)} onSubmit={() => draft.set("")} placeholder="给小菜发消息 记忆 息" />
    </View>
    <Button label="回复 记忆 消息" size="sm" variant="ghost" />
  </View>;
}

if (isAvailable) {
  Window.setTitle("DeepBot 字形诊断 · 原生补丁");
  Window.setFrame({ size: { width: 1000, height: 800 } });
  Window.orderFront();
}
mount(Typography);
