import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { HkIconButton } from '@shared/components/atoms/icon-button/hk-icon-button';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { localDateKey, openNativePicker } from '@core/utils/format';

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
        [min]="bounds().min"
        [max]="bounds().max"
        (click)="openPicker($event)"
        (change)="onInput($event)"
      />
      <hk-icon-button
        icon="lucideChevronRight"
        label="Jour suivant"
        data-testid="day-next"
        (click)="shift(1)"
      />
      <!-- Toujours monte : un bouton qui disparait sous le focus le perd. -->
      <hk-button
        variant="ghost"
        size="sm"
        data-testid="day-today"
        [disabled]="isToday()"
        (click)="dayChange.emit(today())"
      >
        Aujourd'hui
      </hk-button>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkDayPicker {
  readonly day = input.required<string>();
  // Date du jour fournie par le parent (rafraichie chaque minute cote service).
  readonly today = input(localDateKey());
  readonly dayChange = output<string>();

  protected readonly isToday = computed(() => this.day() === this.today());
  // Un an autour d'aujourd'hui : evite les saisies fantaisistes (annee 0099).
  protected readonly bounds = computed(() => {
    const [y, m, d] = this.today().split('-').map(Number);
    return {
      min: localDateKey(new Date(y - 1, m - 1, d)),
      max: localDateKey(new Date(y + 1, m - 1, d)),
    };
  });

  protected shift(days: number): void {
    const [y, m, d] = this.day().split('-').map(Number);
    const date = new Date(y, m - 1, d + days);
    this.dayChange.emit(localDateKey(date));
  }

  // Le calendrier natif s'ouvre au clic sur tout le champ, pas seulement sur
  // l'icone. showPicker est absent de certains navigateurs : on laisse faire.
  protected openPicker(event: Event): void {
    openNativePicker(event.target as HTMLInputElement);
  }

  protected onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const { min, max } = this.bounds();
    if (/^\d{4}-\d{2}-\d{2}$/.test(input.value) && input.value >= min && input.value <= max) {
      this.dayChange.emit(input.value);
      return;
    }
    // Champ vide ou hors bornes : le champ revient sur le jour affiche.
    input.value = this.day();
  }
}
