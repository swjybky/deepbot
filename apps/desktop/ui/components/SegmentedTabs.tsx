import { Text } from "nsh";
import { Tab, Tabs } from "nsh/base";
import { pressCursor } from "./Pressable";

export interface SegmentedTabsProps<T extends string> {
  items: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
}

/**
 * Two to four text tabs that switch the content below them, with a soft pill on the selected one
 * (动态 / 资料库). Constraints: design/components/tabs.md
 */
export function SegmentedTabs<T extends string>(props: SegmentedTabsProps<T>) {
  return (
    <Tabs class="flex-row gap-1 self-center p-[3px]" indicatorClass="inset-y-[3px] rounded-control bg-muted">
      {props.items.map((item) => (
        <Tab
          selected={props.value === item.value}
          onPress={() => props.onChange(item.value)}
          class={`${pressCursor} h-[30px] justify-center rounded-control px-3 hover:bg-chip`}
        >
          <Text class="text-label text-foreground">{item.label}</Text>
        </Tab>
      ))}
    </Tabs>
  );
}
