import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { routes } from './app.routes';
import { documentsFeature } from './store/documents/documents.reducer';
import { DocumentsEffects } from './store/documents/documents.effects';
import { shelvesFeature } from './store/shelves/shelves.reducer';
import { ShelvesEffects } from './store/shelves/shelves.effects';
import { uiFeature } from './store/ui/ui.reducer';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    provideAnimations(),
    provideStore({
      [documentsFeature.name]: documentsFeature.reducer,
      [shelvesFeature.name]: shelvesFeature.reducer,
      [uiFeature.name]: uiFeature.reducer
    }),
    provideEffects([DocumentsEffects, ShelvesEffects]),
    provideStoreDevtools({ maxAge: 25 })
  ]
};
