import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HlmCommandImports } from '@spartan-ng/helm/command';
import { BrnDialogState } from '@spartan-ng/brain/dialog';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { NAV_ITEMS } from '@core/layout/nav-items';

// Palette de commandes : pastille de recherche + raccourci global Ctrl/Cmd+K.
@Component({
  selector: 'hk-command-palette',
  imports: [...HlmCommandImports, HkIcon],
  template: `
    <button
      type="button"
      (click)="open()"
      class="text-muted-foreground border-border hover:bg-muted flex h-9 cursor-pointer items-center gap-2 rounded-sm border px-3 text-sm transition-colors"
      aria-label="Rechercher (Ctrl K)"
    >
      <hk-icon name="lucideSearch" [size]="16" />
      <span class="hidden sm:inline">Rechercher...</span>
      <kbd
        class="bg-muted text-text-subtle hidden rounded px-1.5 py-0.5 font-mono text-xs sm:inline"
      >
        Ctrl K
      </kbd>
    </button>

    <hlm-command-dialog
      [state]="state()"
      (stateChange)="state.set($event)"
      title="Recherche"
      description="Naviguer vers une page"
    >
      <hlm-command class="w-full">
        <hlm-command-input placeholder="Rechercher une page..." />
        <hlm-command-list>
          <hlm-command-group>
            @for (item of navItems; track item.route) {
              <button hlmCommandItem [value]="item.label" (selected)="go(item.route)">
                <hk-icon [name]="item.icon" [size]="16" />
                {{ item.label }}
              </button>
            }
          </hlm-command-group>
        </hlm-command-list>
      </hlm-command>
    </hlm-command-dialog>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkCommandPalette {
  private readonly router = inject(Router);
  protected readonly navItems = NAV_ITEMS;
  protected readonly state = signal<BrnDialogState>('closed');

  constructor() {
    const onKeydown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        this.open();
      }
    };
    window.addEventListener('keydown', onKeydown);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('keydown', onKeydown));
  }

  protected open(): void {
    this.state.set('open');
  }

  protected go(route: string): void {
    this.state.set('closed');
    void this.router.navigateByUrl(route);
  }
}
