import { mount, Storage, View } from "nsh";
import { MessageBubble } from "./ui/features/chat/MessageBubble";

const longMessage = "这是一段用于验证消息气泡宽度的测试文本。窗口变窄时，正文应自然换行。".repeat(12);

// Each wrapper's natural height follows its bubble's wrapping.
function Fixture() {
 return <View class="flex-1 bg-background px-6 pt-[76px]">
  <View onLayout={({ bounds }) => { void Storage.setItem("reply-height", String(bounds.size.height)); }}>
   <MessageBubble message={{ id: "reply-layout", role: "assistant", kind: "text", text: longMessage }} />
  </View>
  <View onLayout={({ bounds }) => { void Storage.setItem("question-height", String(bounds.size.height)); }}>
   <MessageBubble message={{ id: "question-layout", role: "user", kind: "text", text: longMessage }} />
  </View>
 </View>;
}
mount(Fixture);
