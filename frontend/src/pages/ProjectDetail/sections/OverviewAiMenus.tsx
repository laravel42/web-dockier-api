import type { BlockNoteEditor } from "@blocknote/core";
import { filterSuggestionItems } from "@blocknote/core/extensions";
import {
  FormattingToolbar,
  FormattingToolbarController,
  getDefaultReactSlashMenuItems,
  getFormattingToolbarItems,
  SuggestionMenuController,
} from "@blocknote/react";
import { AIToolbarButton, getAISlashMenuItems } from "@blocknote/xl-ai";

function FormattingToolbarWithAI() {
  return (
    <FormattingToolbar>
      {getFormattingToolbarItems()}
      <AIToolbarButton />
    </FormattingToolbar>
  );
}

interface Props {
  editor: BlockNoteEditor;
}

export default function OverviewAiMenus({ editor }: Props) {
  return (
    <>
      <FormattingToolbarController formattingToolbar={FormattingToolbarWithAI} />
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) =>
          filterSuggestionItems(
            [...getDefaultReactSlashMenuItems(editor), ...getAISlashMenuItems(editor)],
            query,
          )
        }
      />
    </>
  );
}
