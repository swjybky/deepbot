import { computed, signal, Text, token, View, type JSX } from "nsh";
import { Input } from "nsh/base";
import { Button } from "./Button";
import { Icon } from "./Icon";
import { Pressable } from "./Pressable";
import { botFill } from "../theme/avatar";

const letter = (index: number) => String.fromCharCode(65 + index);

/** The letter square; a chosen one is filled with the accent (the open Bot's color, darkened for its white letter), else primary. */
function Badge(props: { index: number; selected?: boolean; accent?: string | undefined }) {
  return <View class="h-6 w-6 items-center justify-center rounded-control border border-edge bg-card group-selected:border-primary group-selected:bg-primary" style={props.selected && props.accent ? { backgroundColor: botFill(props.accent), borderColor: botFill(props.accent) } : undefined}><Text class="text-caption font-medium text-muted-foreground group-selected:text-primary-foreground">{letter(props.index)}</Text></View>;
}

/**
 * A question answered by picking one lettered option, or by typing into the last row ("其他").
 * Once answered, only the chosen row stays (marked) under the greyed question. Constraints: design/components/list.md#选择卡片
 */
export function ChoiceCard(props: {
  question: string;
  /** Supporting text under the question (an action's content and destination): two lines until expanded. */
  detail?: string;
  options: readonly string[];
  /** The answer once given: one of the options or the typed text. */
  answer?: string | undefined;
  /** A reply is on its way: rows stop taking presses. */
  pending?: boolean;
  allowOther?: boolean | undefined;
  multiple?: boolean | undefined;
  selectedOptions?: string[];
  inline?: boolean;
  onChoose: (value: string) => void;
  /** Fill of the chosen letter: the open Bot's color. */
  accent?: string;
  /** Names the card for the expand toggle ("展开" + label). */
  label: string;
  /** Extra actions under the options (opening the other side's page). */
  children?: JSX.Element;
  testID?: string;
}) {
  const expanded = signal(false);
  const chosen = signal("");
  const other = signal("");
  const answered = computed(() => props.answer !== undefined);
  const current = () => props.answer ?? (props.pending ? chosen() : "");
  const selected = (value: string) => props.selectedOptions?.includes(value) ?? current() === value;
  const answerIndex = () => { const index = props.options.indexOf(props.answer ?? ""); return index < 0 ? props.options.length : index; };
  const hasDetail = computed(() => !!props.detail);
  const expandable = computed(() => hasDetail() || props.question.includes("\n") || props.question.length > 60);
  const choose = (value: string) => { if (!value.trim() || props.pending || answered()) return; chosen.set(value); props.onChoose(value); };
  const id = (suffix: string) => props.testID ? `${props.testID}-${suffix}` : undefined;
  const header = () => <>
    <View class="flex-row items-start gap-2">
      <Text class={`min-w-0 flex-1 text-body font-semibold ${answered() ? "text-muted-foreground" : "text-foreground"} ${expanded() ? "" : "line-clamp-2"}`}>{props.question}</Text>
      <If when={expandable()}><Icon name={expanded() ? "chevronDown" : "chevronRight"} size={16} color={token("faint-foreground")} /></If>
    </View>
    <If when={hasDetail()}><Text testID={id("preview")} class={`text-label leading-relaxed text-muted-foreground ${expanded() ? "" : "line-clamp-2"}`}>{props.detail}</Text></If>
  </>;
  return (
    <View testID={props.testID} class={props.inline ? "w-full gap-1" : "w-full max-w-[560px] gap-1 self-start rounded-card border border-border bg-card p-2"}>
      <If when={expandable()} else={<View class="gap-1.5 px-2 py-2">{header()}</View>}>
        <Pressable onPress={() => expanded.set(!expanded())} accessibilityLabel={`${expanded() ? "收起" : "展开"}${props.label}`} testID={id("toggle")} class="gap-1.5 rounded-row px-2 py-2 hover:bg-secondary active:bg-chip">{header()}</Pressable>
      </If>
      {answered()
        ? <View accessibilityState={{ selected: true }} testID={id("answer")} class="group flex-row items-center gap-3 rounded-row px-2 py-[7px]"><Badge index={answerIndex()} selected accent={props.accent} /><Text class="min-w-0 flex-1 text-body text-foreground">{props.answer}</Text></View>
        : <View role={props.multiple ? "group" : "radiogroup"} accessibilityLabel={props.question} class="gap-0.5">
          <Each of={props.options} key={(option: string) => option}>
            {(option, index) => <Pressable role={props.multiple ? "checkbox" : "radio"} selected={selected(option())} disabled={props.pending} onPress={() => choose(option())} accessibilityLabel={option()} testID={id(`option-${option()}`)} class="group flex-row items-center gap-3 rounded-row px-2 py-[7px] hover:bg-chip active:bg-muted selected:bg-chip"><Badge index={index()} selected={selected(option())} accent={props.accent} /><Text class="min-w-0 flex-1 text-body text-foreground">{option()}</Text></Pressable>}
          </Each>
          {props.allowOther !== false ? <View class="min-h-[38px] flex-row items-center gap-3 rounded-row px-2 py-0.5">
            <Badge index={props.options.length} />
            <Input value={other()} onChange={({ value }) => other.set(value)} onSubmit={() => choose(other())} disabled={props.pending} placeholder="其他" accessibilityLabel="其他答复" testID={id("input")} class="h-8 min-w-0 flex-1 text-body text-foreground placeholder:text-faint-foreground" />
            {other().trim() ? <Button label={props.pending ? "提交中" : props.inline ? "选用" : "答复"} size="sm" disabled={props.pending} onPress={() => choose(other())} testID={id("submit")} /> : null}
          </View> : null}
        </View>}
      {props.children ? <View class="flex-row gap-2 px-2 pb-1.5 pt-1">{props.children}</View> : null}
    </View>
  );
}
