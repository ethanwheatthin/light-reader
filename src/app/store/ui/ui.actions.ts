import { createActionGroup, emptyProps, props } from '@ngrx/store';

export const UiActions = createActionGroup({
  source: 'UI',
  events: {
    'Open Sidebar': emptyProps(),
    'Close Sidebar': emptyProps(),
    'Toggle Sidebar': emptyProps(),
    'Set Sidebar Open': props<{ open: boolean }>()
  }
});
