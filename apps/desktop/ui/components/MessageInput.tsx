import { Input, type InputProps } from "nsh/base";
/** Borderless input, used only inside the message composer. */
export function MessageInput(props: { value: string; onChange: (value: string) => void; onSubmit: () => void; onPaste?: InputProps["onPaste"]; placeholder: string; disabled?: boolean }) {
  return <Input
    multiline
    value={props.value}
    onChange={({ value }) => props.onChange(value)}
    onSubmit={props.onSubmit}
    onPaste={props.onPaste}
    placeholder={props.placeholder}
    accessibilityLabel="消息"
    submitBehavior="submit"
    disabled={props.disabled}
    testID="composer-input"
    class="min-h-10 max-h-40 min-w-0 flex-1 py-2 text-message text-foreground placeholder:text-faint-foreground"
  />;
}
