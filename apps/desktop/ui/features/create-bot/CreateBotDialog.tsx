import { signal, token, View } from "nsh";
import { avatarHover, BotAvatar, Button, Group, ListRow, SelectField, Modal, ModalBody, ModalFooter, ModalHeader, Pressable, TextField } from "../../components";
import { runtime } from "../../state/runtime";
import { createBot } from "../../state/bots";
import { closeModal, modal } from "../../state/ui";
import { avatarShapes, botColors, type AvatarShapeId } from "../../theme/avatar";

/** 创建新 Bot: a name, a shape and a color, previewed as the avatar on top. */
export function CreateBotDialog() {
  const name = signal("");
  const modelConfigId = signal("");
  const selectedModel = () => modelConfigId() || runtime().defaultModelConfigId;
  const shape = signal<AvatarShapeId>("jelly");
  const color = signal<string>(botColors[2].hex);
  const canCreate = () => name().trim().length > 0 && runtime().modelConfigs.some(c => c.id === selectedModel());

  const close = () => {
    closeModal();
    name.set("");
    modelConfigId.set("");
  };
  const submit = () => {
    if (!canCreate()) return;
    createBot({ name: name().trim(), shape: shape(), color: color(), modelConfigId: selectedModel() });
    close();
  };

  return (
    <Modal open={modal() === "createBot"} onClose={close} width={440} testID="create-bot">
      <ModalHeader title="创建新 Bot" onClose={close} />
      <ModalBody>
        <View class="items-center gap-5">
          <BotAvatar shape={shape()} color={color()} size={120} />
          <TextField
            value={name()}
            onChange={(v) => name.set(v)}
            onSubmit={submit}
            placeholder="给你的 Bot 起个名字"
            accessibilityLabel="Bot 名字"
            align="center"
            maxLength={24}
            autoFocus
            testID="create-bot-name"
          />

          {/* 形状: a radio grid of avatar previews */}
          <View role="radiogroup" accessibilityLabel="形状" class="w-[300px] flex-row flex-wrap justify-center gap-1.5">
            {avatarShapes.map((s) => {
              const hover = avatarHover();
              return (
                <View {...hover.handlers}>
                  <Pressable
                    role="radio"
                    selected={shape() === s.id}
                    accessibilityLabel={`形状 ${s.label}`}
                    onPress={() => shape.set(s.id)}
                    class="size-[50px] items-center justify-center rounded-full border-[1.5px] border-transparent bg-card hover:bg-secondary selected:border-ring"
                  >
                    <BotAvatar shape={s.id} color={color()} size={40} hover={hover} />
                  </Pressable>
                </View>
              );
            })}
          </View>

          {/* 颜色: a radio grid of swatches */}
          <View
            role="radiogroup"
            accessibilityLabel="颜色"
            class="w-[260px] flex-row flex-wrap justify-center"
            style={{ rowGap: 12, columnGap: 14 }}
          >
            {botColors.map((c) => (
              <Pressable
                role="radio"
                selected={color() === c.hex}
                accessibilityLabel={c.label}
                onPress={() => color.set(c.hex)}
                class="size-[26px] rounded-full hover:opacity-90 active:opacity-80"
                style={[
                  { backgroundColor: c.hex },
                  color() === c.hex && { boxShadow: `0 0 0 2px ${token("card")}, 0 0 0 3.5px ${token("ring")}` },
                ]}
              />
            ))}
          </View>
        </View>
        <Group><ListRow title="模型配置" trailing={<SelectField accessibilityLabel="新 Bot 模型配置" value={selectedModel()} options={runtime().modelConfigs.map(c => ({ value: c.id, title: c.name + (c.id === runtime().defaultModelConfigId ? "（默认）" : "") }))} onChange={(id) => modelConfigId.set(id)} testID="create-bot-model" />} /></Group>
      </ModalBody>
      <ModalFooter>
        <Button label="取消" onPress={close} />
        <Button variant="primary" label="创建" disabled={!canCreate()} onPress={submit} testID="create-bot-submit" />
      </ModalFooter>
    </Modal>
  );
}
