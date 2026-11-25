import { signal } from "nsh";
import { currentBot, currentBotId } from "./bots";
import { preferences } from "./preferences";
import { markRead } from "./unread";
import type { Artifact, Memory } from "./runtime";

export type ModalName = "settings" | "createBot" | "renameBot" | "libraryPreview" | "workDetail" | "botConfiguration";
export type BotConfigurationSection = "rules" | "routines";
type LibraryEntry = { kind: "artifact"; item: Artifact } | { kind: "memory"; item: Memory };
export type SettingsSection = "general" | "models" | "computer" | "permissions" | "connections";
export type InfoTab = "activity" | "library" | "configuration";

/** The right-hand bot info panel (点击头像拉出). */
export const infoPanelOpen = signal(false);
export const infoTab = signal<InfoTab>("activity");
/** At most one modal is open at a time. */
export const modal = signal<ModalName | null>(null);
export const libraryPreview = signal<LibraryEntry | null>(null);
export const workDetailId = signal<string | null>(null);
export const botConfiguration = signal<{ botId: string; section: BotConfigurationSection } | null>(null);
export const settingsSection = signal<SettingsSection>("general");
/** The Bot the 重命名 dialog edits. */
export const renamingBotId = signal("");

export function setInfoPanel(open: boolean) {
  if (open === infoPanelOpen()) return;
  infoPanelOpen.set(open);
}

export function openBot(id: string) {
  if (modal() === "workDetail" || modal() === "botConfiguration" || modal() === "libraryPreview") closeModal();
  currentBotId.set(id);
  markRead(id);
  infoTab.set("activity");
  if (preferences().autoOpenInfo) setInfoPanel(true);
}

export function openModal(name: ModalName) {
  modal.set(name);
}

export function openLibraryPreview(entry: LibraryEntry) {
  libraryPreview.set(entry);
  openModal("libraryPreview");
}

export function openWorkDetail(id: string) {
  workDetailId.set(id);
  openModal("workDetail");
}

export function openBotConfiguration(section: BotConfigurationSection) {
  const botId = currentBot().id;
  if (!botId) return;
  botConfiguration.set({ botId, section });
  openModal("botConfiguration");
}

export function closeModal() {
  modal.set(null);
  libraryPreview.set(null);
  workDetailId.set(null);
  botConfiguration.set(null);
}
