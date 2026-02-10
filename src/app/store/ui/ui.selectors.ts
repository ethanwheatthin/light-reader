import { createSelector } from '@ngrx/store';
import { uiFeature } from './ui.reducer';

export const selectSidebarOpen = createSelector(uiFeature.selectUiState, s => s.sidebarOpen);
