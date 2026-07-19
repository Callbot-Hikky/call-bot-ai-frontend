import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Reservation } from '@core/models/reservation.model';
import { ACTIVE_AFTER_MIN, simulationRange } from '@core/models/floor-plan.model';
import { formatTime } from '@core/utils/format';

// FRISE « Soiree de la table » : les resas successives d'une table posees sur
// la fenetre de la soiree — le « second service » se voit d'un coup d'oeil.
// Partagee entre le drawer (page Liste) et l'inspector du plan.
@Component({
  selector: 'hk-table-timeline',
  template: `
    @if (timeline(); as tl) {
      <div class="flex flex-col gap-1">
        <div class="bg-muted relative h-9 overflow-hidden rounded-md" data-testid="table-timeline">
          @for (b of tl.blocks; track b.id) {
            <span
              class="absolute inset-y-1 flex items-center justify-center overflow-hidden rounded-sm px-1 text-[10px] font-semibold whitespace-nowrap text-white"
              [class]="b.current ? 'bg-primary z-10' : 'bg-st-confirmed-fg/60'"
              [style.left.%]="b.left"
              [style.width.%]="b.width"
              [title]="b.title"
            >
              {{ b.label }}
            </span>
          }
        </div>
        <div class="text-text-subtle flex justify-between font-mono text-[10px] tabular-nums">
          <span>{{ tl.startLabel }}</span>
          <span>{{ tl.endLabel }}</span>
        </div>
      </div>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkTableTimeline {
  // Resas VIVANTES de la table (triees par heure).
  readonly reservations = input<Reservation[]>([]);
  // Resa mise en avant (celle affichee dans le detail). null = aucune.
  readonly currentId = input<string | null>(null);

  // Chaque resa devient un bloc de 2 h (duree de service type) sur la fenetre
  // de la soiree (simulationRange : heures pleines, marges avant/apres).
  protected readonly timeline = computed(() => {
    const resas = this.reservations();
    if (resas.length === 0) {
      return null;
    }
    const { start, end } = simulationRange(resas);
    const span = end.getTime() - start.getTime();
    if (span <= 0) {
      return null;
    }
    const currentId = this.currentId();
    const blocks = resas.map((r) => {
      const left = (100 * (new Date(r.dateTime).getTime() - start.getTime())) / span;
      const width = (100 * ACTIVE_AFTER_MIN * 60_000) / span;
      return {
        id: r.id,
        left,
        width: Math.min(width, 100 - left),
        label: `${formatTime(r.dateTime)} · ${r.partySize}`,
        title: `${r.customerName} — ${formatTime(r.dateTime)}, ${r.partySize} couverts`,
        current: r.id === currentId,
      };
    });
    return {
      startLabel: formatTime(start.toISOString()),
      endLabel: formatTime(end.toISOString()),
      blocks,
    };
  });
}
