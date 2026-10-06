import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Menu, MenuFileType, MenuMode, ManualMenu, PublicMenu } from '@core/models/menu.model';

/**
 * Ce que le menu attend de l'exterieur, sans dire comment c'est servi.
 * Deux implementations existent : l'API reelle, et une en memoire pour
 * travailler sans backend. Le service de menu ne sait pas laquelle il utilise,
 * ce qui permet de le tester sans serveur ni requete simulee. Le choix est fait
 * une fois pour toutes au demarrage, dans app.config.ts.
 */
export interface MenuGateway {
  fetch(restaurantId: string): Observable<Menu>;
  put(restaurantId: string, body: { mode: MenuMode; manual?: ManualMenu }): Observable<Menu>;
  /** Le type vient des octets, pas de l'extension : le faux backend s'en sert, le vrai le redetecte. */
  upload(restaurantId: string, file: File, type: MenuFileType): Observable<Menu>;
  removeFile(restaurantId: string, fileId: string): Observable<Menu>;
  reorder(restaurantId: string, fileIds: string[]): Observable<Menu>;
  getPublic(restaurantId: string): Observable<PublicMenu>;
}

export const MENU_GATEWAY = new InjectionToken<MenuGateway>('MENU_GATEWAY');
