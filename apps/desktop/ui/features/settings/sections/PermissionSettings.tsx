import { Text } from "nsh";
import { Group, ListRow, SectionLabel, Switch } from "../../../components";
import { permissionList, setPermission } from "../../../state/preferences";

import { runtime } from "../../../state/runtime";

export function PermissionSettings() {
  return (
    <>
      <SectionLabel title="Bot 可以做什么" first />
      <Group>
        {permissionList.map((perm) => (
          <ListRow
            title={perm.label}
            description={perm.description}
            trailing={
              <Switch
                label={perm.label}
                checked={runtime().settings.permissions[perm.id]}
                onChange={(on) => setPermission(perm.id, on)}
              />
            }
          />
        ))}
      </Group>
      <Text class="text-caption text-muted-foreground">Bot 的后台分身直接在本机运行命令，这些开关对它只写进派工要求，不由代码拦截</Text>
    </>
  );
}
