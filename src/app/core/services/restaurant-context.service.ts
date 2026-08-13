import { Injectable, signal, computed } from '@angular/core';
import { RestaurantContext } from '@core/models/restaurant-context.model';

@Injectable({ providedIn: 'root' })
export class RestaurantContextService {
  private readonly _dietary = signal<string[]>([]);
  private readonly _equipments = signal<string[]>([]);
  private readonly _payments = signal<string[]>([]);
  private readonly _priceRange = signal<string>('');
  private readonly _cuisines = signal<string[]>([]);
  private readonly _moods = signal<string[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal(false);

  readonly dietary = this._dietary.asReadonly();
  readonly equipments = this._equipments.asReadonly();
  readonly payments = this._payments.asReadonly();
  readonly priceRange = this._priceRange.asReadonly();
  readonly cuisines = this._cuisines.asReadonly();
  readonly moods = this._moods.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  readonly context = computed<RestaurantContext>(() => ({
    dietary: this._dietary(),
    equipments: this._equipments(),
    payments: this._payments(),
    priceRange: this._priceRange(),
    cuisines: this._cuisines(),
    moods: this._moods(),
  }));

  setDietary(list: string[]) {
    this._dietary.set(list);
  }

  setEquipments(list: string[]) {
    this._equipments.set(list);
  }

  setPayments(list: string[]) {
    this._payments.set(list);
  }

  setPriceRange(value: string) {
    this._priceRange.set(value);
  }

  setCuisines(list: string[]) {
    this._cuisines.set(list);
  }

  setMoods(list: string[]) {
    this._moods.set(list);
  }

  hydrate(context: RestaurantContext) {
    this._dietary.set(context.dietary);
    this._equipments.set(context.equipments);
    this._payments.set(context.payments);
    this._priceRange.set(context.priceRange);
    this._cuisines.set(context.cuisines);
    this._moods.set(context.moods);
  }

  reset() {
    this._dietary.set([]);
    this._equipments.set([]);
    this._payments.set([]);
    this._priceRange.set('');
    this._cuisines.set([]);
    this._moods.set([]);
  }
}
