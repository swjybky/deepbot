import { Text, token, View } from "nsh";
import { Select } from "nsh/base";
import { Icon } from "./Icon";

export interface SelectOption {
  value: string;
  title: string;
  disabled?: boolean;
}

export interface SelectFieldProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  /** Required: the row's title. */
  accessibilityLabel: string;
  /** sm: 28pt, in the bot info panel. md (default): 30pt, in settings. */
  size?: "sm" | "md";
  /** A color swatch before the title (强调色). */
  swatch?: string;
  testID?: string;
  form?: boolean;
  searchable?: boolean;
  disabled?: boolean;
}

/**
 * A compact dropdown that sits at the end of a settings row: the chosen title + a chevron,
 * opening a popup list. Constraints: design/components/select.md
 */
export function SelectField(props: SelectFieldProps) {
  const title = () => props.options.find((o) => o.value === props.value)?.title ?? "";
  return (
    <Select
      items={props.options}
      searchable={props.searchable}
      disabled={props.disabled}
      value={props.value}
      onChange={({ value }) => value != null && props.onChange(value)}
      accessibilityLabel={props.accessibilityLabel}
      align="end"
      offset={4}
      popupClass="min-w-40 rounded-row border border-edge bg-popover p-1 shadow-popover"
      itemClass="rounded-control px-2.5 py-1.5 text-label text-popover-foreground focus:bg-chip selected:font-semibold"
      trigger={
        <View
          testID={props.testID}
          class={`${props.disabled ? "" : "cursor-pointer"} flex-row items-center rounded-control border border-edge bg-card pr-2 hover:bg-secondary active:bg-chip ${
            props.form ? "h-10 w-full pl-3" : props.size === "sm" ? "h-7 pl-2.5" : "h-[30px] pl-3"
          }`}
          style={{ gap: props.swatch ? 6 : 4 }}
        >
          {props.swatch ? <View class="size-2.5 rounded-full" style={{ backgroundColor: props.swatch }} /> : null}
          <Text class={`line-clamp-1 text-foreground ${props.form ? "min-w-0 flex-1 text-body" : "text-label"}`}>{title()}</Text>
          <Icon name="chevronDown" size={12} strokeWidth={2} color={token("muted-foreground")} />
        </View>
      }
    />
  );
}
