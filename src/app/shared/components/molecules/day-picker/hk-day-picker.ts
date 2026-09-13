import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { HkIconButton } from '@shared/components/atoms/icon-button/hk-icon-button';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { localDateKey } from '@core/utils/format';

// Choix du jour affiche (liste, plan) : la veille, le lendemain, une date au choix,
// et un retour rapide a aujourd'hui. La valeur echangee est une cle « YYYY-MM-DD ».
@Component({
  selector: 'hk-day-picker',
  imports: [HkIconButton, HkButton],
  template: `
    <div class="flex flex-wrap items-center gap-2" data-testid="day-picker">
      <hk-icon-button
        icon="lucideChevronLeft"
        label="Jour précédent"
        data-testid="day-prev"
        (click)="shift(-1)"
      />
      <input
        type="date"
        class="border-border bg-card text-text-strong focus-visible:ring-primary/30 h-9 rounded-md border px-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
        aria-label="Jour affiché"
        data-testid="day-input"
        [value]="day()"
        (change)="onInput($event)"
      />
      <hk-icon-button
        icon="lucideChevronRight"
        label="Jour suivant"
        data-testid="day-next"
        (click)="shift(1)"
      />
      @if (!isToday()) {
        <hk-button
          variant="ghost"
          size="sm"
          data-testid="day-today"
          (click)="dayChange.emit(today)"
        >
          Aujourd'hui
        </hk-button>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkDayPicker {
  readonly day = input.required<string>();
  readonly dayChange = output<string>();

  protected readonly today = localDateKey();
  protected readonly isToday = computed(() => this.day() === this.today);

  protected shift(days: number): void {
    const [y, m, d] = this.day().split('-').map(Number);
    const date = new Date(y, m - 1, d + days);
    this.dayChange.emit(localDateKey(date));
  }

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      this.dayChange.emit(value);
    }
  }
}
