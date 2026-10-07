import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { environment } from '@env/environment';
import { MenuDto, PublicMenuDto, mapMenu, mapPublicMenu } from '@core/models/menu-dto.model';
import { Menu, MenuMode, ManualMenu, PublicMenu, withoutManualKeys } from '@core/models/menu.model';
import { MenuGateway } from './menu-gateway';

/** La vraie API. Les reponses completes remplacent l'etat, jamais des fragments. */
@Injectable({ providedIn: 'root' })
export class HttpMenuGateway implements MenuGateway {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/restaurants`;

  private menuUrl(restaurantId: string): string {
    return `${this.baseUrl}/${restaurantId}/menu`;
  }

  fetch(restaurantId: string): Observable<Menu> {
    return this.http.get<MenuDto>(this.menuUrl(restaurantId)).pipe(map(mapMenu));
  }

  put(restaurantId: string, body: { mode: MenuMode; manual?: ManualMenu }): Observable<Menu> {
    // Les cles de suivi sont internes a l'ecran : le document part sans elles.
    const payload = body.manual
      ? { mode: body.mode, manual: withoutManualKeys(body.manual) }
      : { mode: body.mode };
    return this.http.put<MenuDto>(this.menuUrl(restaurantId), payload).pipe(map(mapMenu));
  }

  upload(restaurantId: string, file: File): Observable<Menu> {
    // Le fichier part tel quel, en binaire : pas d'encodage qui gonflerait sa taille.
    const form = new FormData();
    form.append('file', file);
    return this.http.post<MenuDto>(`${this.menuUrl(restaurantId)}/files`, form).pipe(map(mapMenu));
  }

  removeFile(restaurantId: string, fileId: string): Observable<Menu> {
    return this.http
      .delete<MenuDto>(`${this.menuUrl(restaurantId)}/files/${fileId}`)
      .pipe(map(mapMenu));
  }

  reorder(restaurantId: string, fileIds: string[]): Observable<Menu> {
    return this.http
      .put<MenuDto>(`${this.menuUrl(restaurantId)}/files/order`, { fileIds })
      .pipe(map(mapMenu));
  }

  getPublic(restaurantId: string): Observable<PublicMenu> {
    return this.http
      .get<PublicMenuDto>(`${environment.apiUrl}/public/restaurants/${restaurantId}/menu`)
      .pipe(map(mapPublicMenu));
  }
}
