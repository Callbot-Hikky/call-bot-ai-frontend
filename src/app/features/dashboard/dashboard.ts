import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { HkPageHeader } from '@shared/components/organisms/page-header/hk-page-header';
import { HkStatRow, StatItem } from '@shared/components/organisms/stat-row/hk-stat-row';
import { HkBarChart, BarDatum } from '@shared/components/molecules/bar-chart/hk-bar-chart';
import { HkBadge } from '@shared/components/atoms/badge/hk-badge';
import { ReservationService } from '@core/services/reservation.service';
import { formatTime } from '@core/utils/format';

@Component({
  selector: 'app-dashboard',
  imports: [HkPageHeader, HkStatRow, HkBarChart, HkBadge],
  template: `
    <hk-page-header subtitle="Vue d'ensemble du service de ce soir" />

    <div class="flex flex-col gap-6">
      <hk-stat-row [stats]="stats()" [loading]="service.loading()" />

      @if (service.loading()) {
        <div class="grid gap-6 lg:grid-cols-3">
          <div class="bg-muted h-72 animate-pulse rounded-lg lg:col-span-2"></div>
          <div class="bg-muted h-72 animate-pulse rounded-lg"></div>
        </div>
      } @else {
        <div class="grid gap-6 lg:grid-cols-3">
          <section class="bg-card border-border/70 rounded-lg border p-6 shadow-md lg:col-span-2">
            <h2 class="text-text-strong text-lg font-semibold">Affluence du service</h2>
            <p class="text-muted-foreground mb-6 text-sm">Couverts attendus par créneau</p>
            <hk-bar-chart [bars]="affluence()" emptyLabel="Aucun couvert attendu ce soir." />
          </section>

          <section class="bg-card border-border/70 flex flex-col rounded-lg border p-6 shadow-md">
            <h2 class="text-text-strong text-lg font-semibold">Origine des réservations</h2>
            <p class="text-muted-foreground text-sm">
              Agent vocal, réservation en ligne, saisie manuelle
            </p>
            <div class="flex flex-1 flex-col justify-center gap-5 pt-6">
              <div>
                <div class="mb-2 flex items-center justify-between text-sm">
                  <span class="flex items-center gap-2">
                    <span class="bg-primary size-2.5 rounded-full"></span> Agent vocal
                  </span>
                  <span class="text-muted-foreground font-mono tabular-nums">
                    {{ source().bot }} ({{ source().botPct }}%)
                  </span>
                </div>
                <div class="bg-muted h-2.5 overflow-hidden rounded-full">
                  <div
                    class="bg-primary h-full rounded-full"
                    [style.width.%]="source().botPct"
                  ></div>
                </div>
              </div>
              <div>
                <div class="mb-2 flex items-center justify-between text-sm">
                  <span class="flex items-center gap-2">
                    <span class="size-2.5 rounded-full bg-sky-500"></span> En ligne
                  </span>
                  <span class="text-muted-foreground font-mono tabular-nums">
                    {{ source().web }} ({{ source().webPct }}%)
                  </span>
                </div>
                <div class="bg-muted h-2.5 overflow-hidden rounded-full">
                  <div
                    class="h-full rounded-full bg-sky-500"
                    [style.width.%]="source().webPct"
                  ></div>
                </div>
              </div>
              <div>
                <div class="mb-2 flex items-center justify-between text-sm">
                  <span class="flex items-center gap-2">
                    <span class="bg-border-strong size-2.5 rounded-full"></span> Saisie manuelle
                  </span>
                  <span class="text-muted-foreground font-mono tabular-nums">
                    {{ source().manual }} ({{ source().manualPct }}%)
                  </span>
                </div>
                <div class="bg-muted h-2.5 overflow-hidden rounded-full">
                  <div
                    class="bg-border-strong h-full rounded-full"
                    [style.width.%]="source().manualPct"
                  ></div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <section class="bg-card border-border/70 rounded-lg border p-6 shadow-md">
          <h2 class="text-text-strong mb-4 text-lg font-semibold">Prochaines réservations</h2>
          <div class="divide-border/70 flex flex-col divide-y">
            @for (r of upcoming(); track r.id) {
              <div class="flex items-center gap-3 py-2.5">
                <span class="text-foreground w-12 font-mono text-sm tabular-nums">
                  {{ formatTime(r.dateTime) }}
                </span>
                <span class="text-foreground flex-1 truncate text-sm font-medium">
                  {{ r.customerName }}
                </span>
                <span class="text-muted-foreground hidden font-mono text-xs tabular-nums sm:block">
                  {{ r.partySize }} couv.
                </span>
                <hk-badge [status]="r.status" />
              </div>
            } @empty {
              <p class="text-muted-foreground py-4 text-sm">Aucune réservation à venir.</p>
            }
          </div>
        </section>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardPage {
  protected readonly service = inject(ReservationService);

  protected readonly stats = computed<StatItem[]>(() => {
    const all = this.service.reservations();
    const active = all.filter((r) => r.status !== 'cancelled' && r.status !== 'no_show');
    const couverts = active.reduce((sum, r) => sum + r.partySize, 0);
    const bot = all.filter((r) => r.source === 'callbot').length;
    const honored = all.filter(
      (r) => r.status === 'confirmed' || r.status === 'seated' || r.status === 'completed',
    ).length;
    const rate = active.length ? Math.round((honored / active.length) * 100) : 0;
    return [
      { label: 'Réservations', value: active.length, icon: 'lucideCalendar' },
      { label: 'Couverts', value: couverts, icon: 'lucideUsers' },
      { label: 'Captées par le bot', value: bot, icon: 'lucidePhoneCall', highlight: true },
      { label: 'Confirmation', value: `${rate}%`, icon: 'lucideCircleCheck' },
    ];
  });

  protected readonly affluence = computed<BarDatum[]>(() => {
    const slots = new Map<string, number>();
    for (const r of this.service.reservations()) {
      if (r.status === 'cancelled' || r.status === 'no_show') {
        continue;
      }
      const slot = formatTime(r.dateTime);
      slots.set(slot, (slots.get(slot) ?? 0) + r.partySize);
    }
    return [...slots.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, value]) => ({ label, value }));
  });

  protected readonly source = computed(() => {
    const all = this.service.reservations();
    const bot = all.filter((r) => r.source === 'callbot').length;
    const web = all.filter((r) => r.source === 'web').length;
    const manual = all.filter((r) => r.source === 'manual').length;
    const total = bot + web + manual || 1;
    return {
      bot,
      web,
      manual,
      botPct: Math.round((bot / total) * 100),
      webPct: Math.round((web / total) * 100),
      manualPct: Math.round((manual / total) * 100),
    };
  });

  protected readonly upcoming = computed(() =>
    this.service
      .reservations()
      .filter((r) => r.status === 'pending' || r.status === 'confirmed')
      .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
      .slice(0, 6),
  );

  protected readonly formatTime = formatTime;

  constructor() {
    this.service.loadToday();
  }
}
