import { Scroll, signal, Text, token, View } from "nsh";
import { Checkbox, Popover } from "nsh/base";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { pressCursor } from "./Pressable";
import { TextField } from "./TextField";

export function MultiSelectField(props: {
  options: string[];
  value: string[];
  onChange: (values: string[]) => void;
  accessibilityLabel: string;
  placeholder: string;
  searchLabel: string;
  selectedLabel: (count: number) => string;
  emptyLabel: string;
  optionLabel?: (value: string) => string;
  disabled?: boolean;
  testID?: string;
}) {
  const open = signal(false);
  const search = signal("");
  const label = (option: string) => props.optionLabel?.(option) ?? option;
  const filtered = () => {
    const query = search().trim().toLowerCase();
    return props.options.filter(option => label(option).toLowerCase().includes(query));
  };
  const toggle = (option: string, checked: boolean) => {
    props.onChange(checked ? [...props.value, option] : props.value.filter(value => value !== option));
  };
  const title = () => props.value.length > 1 ? props.selectedLabel(props.value.length) : props.value[0] === undefined ? props.placeholder : label(props.value[0]);
  return <Popover open={!props.disabled && open()} onOpenChange={event => { if (!props.disabled) open.set(event.open); }}
    onClose={() => search.set("")} align="start" offset={4}
    popupClass="w-80 gap-1 rounded-row border border-edge bg-popover p-1 shadow-popover"
    trigger={
      <View class={`h-10 w-full flex-row items-center gap-1 rounded-control border border-edge bg-card pl-3 pr-2 ${props.disabled ? "" : "cursor-pointer hover:bg-secondary active:bg-chip"}`}
        accessibilityLabel={props.accessibilityLabel} testID={props.testID}>
        <Text class="min-w-0 flex-1 line-clamp-1 text-body text-foreground">{title()}</Text>
        <Icon name="chevronDown" size={12} strokeWidth={2} color={token("muted-foreground")} />
      </View>
    }>
    <TextField value={search()} onChange={value => search.set(value)} placeholder={props.searchLabel}
      accessibilityLabel={props.searchLabel} testID={`${props.testID}-search`} />
    {filtered().length ? <Scroll style={{ height: Math.min(filtered().length, 6) * 36 }}>
      <Each of={filtered()} key={option => option}>{option => <Checkbox
        class={`h-9 flex-row items-center gap-2 rounded-control px-2.5 hover:bg-chip active:bg-muted ${pressCursor}`}
        indicatorClass="size-4 items-center justify-center rounded border border-edge checked:border-primary checked:bg-primary"
        indicator={props.value.includes(option()) ? <Icon name="check" size={12} strokeWidth={2} color={token("primary-foreground")} /> : null}
        checked={props.value.includes(option())}
        onChange={({ checked }) => toggle(option(), checked)} accessibilityLabel={label(option())}>
        <Text class="min-w-0 flex-1 line-clamp-1 text-label text-popover-foreground">{label(option())}</Text>
      </Checkbox>}</Each>
    </Scroll> : <Text class="px-2.5 py-2 text-label text-muted-foreground">{props.emptyLabel}</Text>}
    <View class="flex-row items-center justify-between px-1">
      <Text class="text-label text-muted-foreground">{props.selectedLabel(props.value.length)}</Text>
      <Button label="完成" variant="ghost" size="sm" onPress={() => open.set(false)} testID={`${props.testID}-done`} />
    </View>
  </Popover>;
}
