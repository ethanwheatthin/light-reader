import { createFeature, createReducer, on } from '@ngrx/store';
import { UiActions } from './ui.actions';

export interface UiState {
  sidebarOpen: boolean;
}

export const initialState: UiState = {
  sidebarOpen: false
};

export const uiFeature = createFeature({
  name: 'ui',
  reducer: createReducer(
    initialState,
    on(UiActions.openSidebar, (state) => ({ ...state, sidebarOpen: true })),
    on(UiActions.closeSidebar, (state) => ({ ...state, sidebarOpen: false })),
    on(UiActions.toggleSidebar, (state) => ({ ...state, sidebarOpen: !state.sidebarOpen })),
    on(UiActions.setSidebarOpen, (state, { open }) => ({ ...state, sidebarOpen: open }))
  )
});
