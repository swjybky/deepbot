import { Button } from "./Button";
import { openExternal, type Attention } from "../state/runtime";
import { openT3Thread, t3ThreadBrowserFallback, t3ThreadOpening } from "../state/t3-thread";

export function T3ThreadButtons(props: { attention: Attention }) {
  return <>
    <Button label="打开 T3 Code" size="sm" testID="t3-open-desktop" disabled={t3ThreadOpening(props.attention.id)} onPress={() => { void openT3Thread(props.attention); }} />
    <If when={t3ThreadBrowserFallback(props.attention)}>{url => <Button label="在浏览器打开" size="sm" testID="t3-open-browser" onPress={() => { void openExternal(url()); }} />}</If>
  </>;
}
