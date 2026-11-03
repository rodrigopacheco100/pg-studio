import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator, MenubarShortcut, MenubarTrigger } from "@/components/ui/menubar";

/** Everything the menu can trigger; the owners of each command wire it up in `App`. */
export interface MenuActions {
  newFile: () => void;
  openFile: () => void;
  saveFile: () => void;
  saveFileAs: () => void;
  closeTab: () => void;
  run: () => void;
  runAtCursor: () => void;
  beautify: () => void;
  saveQuery: () => void;
  newConnection: () => void;
  refreshTables: () => void;
  openSettings: () => void;
  checkForUpdates: () => void;
  showReleaseHistory: () => void;
  /** Whether a connection is active (needed to refresh its tables). */
  connected: boolean;
}

function Item({ label, shortcut, onSelect, disabled }: { label: string; shortcut?: string; onSelect: () => void; disabled?: boolean }) {
  return (
    <MenubarItem onSelect={onSelect} disabled={disabled}>
      {label}
      {shortcut && <MenubarShortcut>{shortcut}</MenubarShortcut>}
    </MenubarItem>
  );
}

export function AppMenu(a: MenuActions) {
  return (
    <Menubar className="col-span-2 border-b bg-sidebar px-1.5 py-1">
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <Item label="New file" shortcut="Ctrl+T" onSelect={a.newFile} />
          <Item label="Open file…" shortcut="Ctrl+O" onSelect={a.openFile} />
          <MenubarSeparator />
          <Item label="Save" shortcut="Ctrl+S" onSelect={a.saveFile} />
          <Item label="Save as…" shortcut="Ctrl+Shift+S" onSelect={a.saveFileAs} />
          <MenubarSeparator />
          <Item label="Close tab" shortcut="Ctrl+W" onSelect={a.closeTab} />
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Query</MenubarTrigger>
        <MenubarContent>
          <Item label="Run" shortcut="Ctrl+Enter" onSelect={a.run} />
          <Item label="Run statement at cursor" shortcut="Ctrl+Shift+Enter" onSelect={a.runAtCursor} />
          <MenubarSeparator />
          <Item label="Beautify" shortcut="Ctrl+Shift+F" onSelect={a.beautify} />
          <Item label="Save query…" onSelect={a.saveQuery} />
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Connection</MenubarTrigger>
        <MenubarContent>
          <Item label="New connection…" onSelect={a.newConnection} />
          <Item label="Refresh tables" onSelect={a.refreshTables} disabled={!a.connected} />
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Settings</MenubarTrigger>
        <MenubarContent>
          <Item label="Preferences…" onSelect={a.openSettings} />
        </MenubarContent>
      </MenubarMenu>
      <MenubarMenu>
        <MenubarTrigger>Help</MenubarTrigger>
        <MenubarContent>
          <Item label="What's new…" onSelect={a.showReleaseHistory} />
          <Item label="Check for updates…" onSelect={a.checkForUpdates} />
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  );
}
