import { DestroyRef, effect, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ReservationService } from '@core/services/reservation.service';
import { localDateKey } from '@core/utils/format';

export const DAY_QUERY_PARAM = 'jour';
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

// Le jour affiche (liste, plan) vit dans l'URL : « /reservations?jour=2026-09-14 ».
// Il survit ainsi au rechargement et se partage d'un onglet a l'autre. Le jour
// courant n'apparait pas dans l'URL (adresse propre par defaut).
// A appeler dans le constructeur d'une page (contexte d'injection).
export function bindDayToQuery(): void {
  const route = inject(ActivatedRoute);
  const router = inject(Router);
  const service = inject(ReservationService);
  const destroyRef = inject(DestroyRef);

  const fromUrl = route.snapshot.queryParamMap.get(DAY_QUERY_PARAM);
  if (fromUrl && DAY_KEY.test(fromUrl) && isPlausible(fromUrl)) {
    service.setDay(fromUrl);
  }

  const ref = effect(() => {
    const day = service.day();
    const wanted = day === localDateKey() ? null : day;
    if (route.snapshot.queryParamMap.get(DAY_QUERY_PARAM) === wanted) return;
    void router.navigate([], {
      relativeTo: route,
      queryParams: { [DAY_QUERY_PARAM]: wanted },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  });
  destroyRef.onDestroy(() => ref.destroy());
}

// Un an autour d'aujourd'hui, comme les bornes du selecteur de jour.
function isPlausible(day: string): boolean {
  const today = new Date();
  const min = localDateKey(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
  const max = localDateKey(new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()));
  return day >= min && day <= max;
}
