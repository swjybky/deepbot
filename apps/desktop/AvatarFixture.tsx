/** Bot avatar regression fixture (every shape, color and size); never imported by the production app. */
import { mount, View } from "nsh";
import { BotAvatar } from "./ui/components";
import { avatarShapes, botColors } from "./ui/theme/avatar";

function Avatars() {
  return (
    <View class="flex-1 gap-4 bg-background p-6">
      <View class="flex-row gap-4">
        {[120, 84, 64, 42, 40, 30].map((size) => (
          <BotAvatar shape="jelly" color="#8B5CF6" size={size} />
        ))}
      </View>
      <View class="flex-row flex-wrap gap-3" testID="avatar-grid">
        {avatarShapes.map((s, i) => (
          <BotAvatar shape={s.id} color={(botColors[i % botColors.length] ?? botColors[0]).hex} size={72} />
        ))}
      </View>
      <View class="flex-row flex-wrap gap-3">
        {botColors.map((c, i) => (
          <BotAvatar shape={(avatarShapes[(i * 5) % avatarShapes.length] ?? avatarShapes[0]).id} color={c.hex} size={36} />
        ))}
      </View>
    </View>
  );
}

mount(Avatars);
