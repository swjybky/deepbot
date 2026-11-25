import { ActionRow } from "../../components";
import type { Artifact } from "../../state/runtime";
import { openLibraryPreview } from "../../state/ui";

/** A work product shared by the library tab and the work detail. */
export function ArtifactCard(props: { artifact: Artifact; onPreview?: (artifact: Artifact) => void }) {
  return <ActionRow
    title={props.artifact.name}
    accessibilityLabel={`预览资料 ${props.artifact.name}`}
    testID={`artifact-${props.artifact.id}`}
    onPress={() => {
      if (props.onPreview) props.onPreview(props.artifact);
      else openLibraryPreview({ kind: "artifact", item: props.artifact });
    }}
  />;
}
