import { Text, View } from "nsh";

/** The little "Bot 的电脑 · 休眠中" illustration: a screen with a closed-eyed face and a "z". */
export function SleepingComputer() {
  return (
    <View class="h-10 w-16 items-center justify-center rounded-control" style={{ backgroundColor: "#E9E9E7" }}>
      <View class="size-5 flex-row items-center justify-center gap-[3px] rounded-full" style={{ backgroundColor: "#9A9A98" }}>
        <View class="h-0.5 w-1 rounded-[1px] bg-card" />
        <View class="h-0.5 w-1 rounded-[1px] bg-card" />
      </View>
      <Text class="absolute right-1.5 top-0.5 text-muted-foreground" style={{ fontSize: 9 }}>
        z
      </Text>
    </View>
  );
}
