import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgIcon } from '@ng-icons/core';

// Wrapper autour de ng-icons (set Lucide). Les icônes sont enregistrées dans app.config.
@Component({
  selector: 'hk-icon',
  imports: [NgIcon],
  template: `<ng-icon [name]="name()" [size]="sizePx()" aria-hidden="true" />`,
  host: { class: 'inline-flex' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkIcon {
  readonly name = input.required<string>();
  // Taille en pixels (nombre), convertie en chaîne pour ng-icon.
  readonly size = input<number>(18);
  protected readonly sizePx = computed(() => `${this.size()}px`);
}
