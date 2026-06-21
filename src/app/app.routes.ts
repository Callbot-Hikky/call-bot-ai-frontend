import { Routes } from '@angular/router';
import { TokensDemo } from './features/tokens-demo/tokens-demo';

export const routes: Routes = [
  // Route temporaire de validation des tokens (étape design 01)
  { path: '_tokens', component: TokensDemo },
  { path: '', redirectTo: '_tokens', pathMatch: 'full' },
];
