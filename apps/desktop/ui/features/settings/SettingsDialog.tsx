import { Scroll, Text, View, type JSX } from "nsh";
import { Modal, ModalCloseButton, NavItem, NavList } from "../../components";
import type { IconName } from "../../theme/icons";
import { closeModal, modal, settingsSection, type SettingsSection } from "../../state/ui";
import { ComputerSettings } from "./sections/ComputerSettings";
import { GeneralSettings } from "./sections/GeneralSettings";
import { PermissionSettings } from "./sections/PermissionSettings";
import { ModelSettings } from "./sections/ModelSettings";
import { ConnectionSettings } from "./sections/ConnectorSettings";

const sections = [
  { id: "general", label: "通用", icon: "settings", render: () => <GeneralSettings /> },
  { id: "models", label: "模型", icon: "settings", render: () => <ModelSettings /> },
  { id: "connections", label: "连接", icon: "plug", render: () => <ConnectionSettings /> },
  { id: "computer", label: "电脑", icon: "monitor", render: () => <ComputerSettings /> },
  { id: "permissions", label: "权限", icon: "shield", render: () => <PermissionSettings /> },
] as const satisfies readonly { id: SettingsSection; label: string; icon: IconName; render: () => JSX.Element }[];

/** 我的设置: a 920×660 modal with its categories on the left and the chosen one on the right. */
export function SettingsDialog() {
  const current = () => sections.find((s) => s.id === settingsSection()) ?? sections[0];
  return (
    <Modal open={modal() === "settings"} onClose={closeModal} width={920} height={660} row testID="settings">
      <View class="w-[210px] border-r border-divider px-3 py-4">
        <NavList>
          {sections.map((s) => (
            <NavItem
              label={s.label}
              icon={s.icon}
              selected={settingsSection() === s.id}
              onPress={() => settingsSection.set(s.id)}
              testID={`settings-${s.id}`}
            />
          ))}
        </NavList>
      </View>
      <Scroll class="flex-1" contentClass="px-10 pb-10 pt-8">
        <Text role="header" class="mb-6 text-heading font-semibold text-foreground">
          {current().label}
        </Text>
        <View class="gap-2.5">{current().render()}</View>
      </Scroll>
      <ModalCloseButton onClose={closeModal} label="关闭设置" />
    </Modal>
  );
}
