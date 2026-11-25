import { effect, signal, type InputRef } from "nsh";

/** Wait for the saved row to mount before returning focus to the add form. */
export function focusAfterAdd(rows: () => { id: string }[]) {
  const addedId = signal("");
  let input: InputRef | undefined;
  effect(() => {
    const id = addedId();
    if (!id || !rows().some(row => row.id === id)) return;
    const frame = requestAnimationFrame(() => {
      addedId.set("");
      input?.focus();
    });
    return () => cancelAnimationFrame(frame);
  });
  return {
    inputRef: (node: InputRef) => { input = node; },
    afterAdd: (id: string) => addedId.set(id),
  };
}
