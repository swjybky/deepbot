import { token } from "nsh";
import { Switch as BaseSwitch } from "nsh/base";
import { pressCursor } from "./Pressable";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Required: the row's title, so screen readers name the switch. */
  label: string;
  disabled?: boolean;
  testID?: string;
}

/**
 * An on/off switch, 40×24. On, it takes the accent color (the open bot's color).
 * Constraints: design/components/switch.md
 */
export function Switch(props: SwitchProps) {
  return (
    <BaseSwitch
      checked={props.checked}
      disabled={props.disabled}
      onChange={({ checked }) => props.onChange(checked)}
      accessibilityLabel={props.label}
      testID={props.testID}
      class={`${pressCursor} disabled:opacity-50`}
      trackClass="h-6 w-10 rounded-full p-[3px] transition-colors"
      trackStyle={{ backgroundColor: props.checked ? token("primary") : token("track") }}
      thumbClass="size-[18px] rounded-full bg-card shadow-thumb transition-transform checked:translate-x-4"
    />
  );
}
