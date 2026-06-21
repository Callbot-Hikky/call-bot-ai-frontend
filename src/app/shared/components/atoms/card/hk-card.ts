import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

// Conteneur de base : surface, bordure, rayon md, padding 24. Variante interactive (hover).
@Component({
  selector: 'hk-card',
  template: `
    <div [class]="classes()">
      <ng-content />
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkCard {
  readonly interactive = input(false);

  protected readonly classes = computed(() =>
    [
      'bg-card border-border rounded-md border p-6 shadow-sm',
      this.interactive() ? 'cursor-pointer transition-shadow duration-150 hover:shadow-md' : '',
    ].join(' '),
  );
}
