import { effect, signal, untracked } from "nsh";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader, TextField } from "../../components";
import { bots, renameBot } from "../../state/bots";
import { closeModal, modal, renamingBotId } from "../../state/ui";

/** 重命名 Bot from the sidebar menu: one name field, prefilled with the current name. */
export function RenameBotDialog() {
  const name = signal("");
  const botName = (id: string) => bots().find((bot) => bot.id === id)?.name;
  effect(() => {
    if (modal() !== "renameBot") return;
    const id = renamingBotId();
    // Seed the draft on open or target change. Runtime snapshots can refresh the Bot list while editing.
    name.set(untracked(() => botName(id)) ?? "");
  });
  const canSave = () => name().trim().length > 0 && name().trim() !== botName(renamingBotId());

  const close = () => closeModal();
  const submit = () => {
    if (!canSave()) return;
    renameBot(renamingBotId(), name());
    close();
  };

  return (
    <Modal open={modal() === "renameBot"} onClose={close} width={440} testID="rename-bot">
      <ModalHeader title="重命名 Bot" onClose={close} />
      <ModalBody>
        <TextField
          value={name()}
          onChange={(v) => name.set(v)}
          onSubmit={submit}
          placeholder="Bot 名字"
          accessibilityLabel="Bot 名字"
          maxLength={24}
          autoFocus
          testID="rename-bot-name"
        />
      </ModalBody>
      <ModalFooter>
        <Button label="取消" onPress={close} />
        <Button variant="primary" label="保存" disabled={!canSave()} onPress={submit} testID="rename-bot-submit" />
      </ModalFooter>
    </Modal>
  );
}
