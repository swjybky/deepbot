import { FeedbackHost, ResizableColumns } from "./components";
import { infoPanelOpen, modal } from "./state/ui";
import { View } from "nsh";
import { connectAgent } from "./state/runtime";
import { BotInfoPanel } from "./features/bot-info/BotInfoPanel";
import { BotConfigurationDialog } from "./features/bot-info/BotConfiguration";
import { LibraryPreviewDialog } from "./features/bot-info/LibraryPreviewDialog";
import { WorkDetailDialog } from "./features/bot-info/WorkDetail";
import { ChatPane } from "./features/chat/ChatPane";
import { CreateBotDialog } from "./features/create-bot/CreateBotDialog";
import { SettingsDialog } from "./features/settings/SettingsDialog";
import { RenameBotDialog } from "./features/sidebar/RenameBotDialog";
import { Sidebar } from "./features/sidebar/Sidebar";

/**
 * The window: resizable sidebar | conversation | bot info, and the modals over
 * everything. Layout rules: design/layout.md
 */
export function AppShell() {
  connectAgent();
  return (
    <View class="flex-1 flex-row bg-background">
      <ResizableColumns leading={<Sidebar />} trailing={<BotInfoPanel />} trailingVisible={infoPanelOpen()}>
        <ChatPane />
      </ResizableColumns>
      <SettingsDialog />
      <CreateBotDialog />
      <RenameBotDialog />
      <LibraryPreviewDialog />
      <WorkDetailDialog />
      <BotConfigurationDialog />
      {modal() === null ? <FeedbackHost /> : null}
    </View>
  );
}
