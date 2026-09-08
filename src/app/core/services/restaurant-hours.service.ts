import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';

export interface HoursEntry {
  restaurantId: string;
  dayOfWeek: number;
  service: string;
  opensAt: string;
  closesAt: string;
  isClosed?: boolean;
}

@Injectable({ providedIn: 'root' })
export class RestaurantHoursService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/restaurant-hours`;

  create(entry: HoursEntry): Observable<unknown> {
    return this.http.post(this.baseUrl, entry);
  }
}
