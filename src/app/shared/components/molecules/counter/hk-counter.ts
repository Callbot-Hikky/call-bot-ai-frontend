import { Component, computed, input, model } from '@angular/core';
import { HlmButton } from '@spartan-ng/helm/button';
import { HlmIcon } from '@spartan-ng/helm/icon';
import { NgIcon } from '@ng-icons/core';

@Component({
  selector: 'hk-counter',
  imports: [HlmButton, HlmIcon, NgIcon],
  template: `
    <div class="flex items-center gap-4">
      <button hlmBtn variant="outline" size="icon" [disabled]="atMin()" (click)="decrement()">
        <ng-icon hlm size="sm" name="lucideMinus" />
      </button>
      <span class="w-8 text-center text-lg font-semibold">{{ value() }}</span>
      <button hlmBtn variant="outline" size="icon" [disabled]="atMax()" (click)="increment()">
        <ng-icon hlm size="sm" name="lucidePlus" />
      </button>
    </div>
  `,
})
export class HkCounter {
  value = model.required<number>();
  min = input<number>(1);
  max = input<number>(20);

  atMin = computed(() => this.value() <= this.min());
  atMax = computed(() => this.value() >= this.max());

  increment(): void {
    this.value.update((n) => Math.min(n + 1, this.max()));
  }

  decrement(): void {
    this.value.update((n) => Math.max(n - 1, this.min()));
  }
}
