import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { Toast, ToastService, ToastVariant } from '@core/services/toast.service';

const ICON: Record<ToastVariant, string> = {
  default: 'lucideBell',
  success: 'lucideCheck',
  error: 'lucideX',
};

const ICON_COLOR: Record<ToastVariant, string> = {
  default: 'text-text-subtle',
  success: 'text-st-confirmed-fg',
  error: 'text-st-cancelled-fg',
};

// Conteneur de toasts, placé une fois (shell). Lit la file du ToastService.
@Component({
  selector: 'hk-toaster',
  imports: [HkIcon],
  template: `
    <div
      class="pointer-events-none fixed right-4 bottom-4 flex flex-col gap-2"
      style="z-index: var(--z-toast)"
      aria-live="polite"
    >
      @for (t of toasts(); track t.id) {
        <div
          class="bg-card border-border animate-in fade-in-0 slide-in-from-bottom-2 pointer-events-auto flex w-80 items-start gap-3 rounded-md border px-4 py-3 shadow-md"
        >
          <hk-icon [name]="icon(t.variant)" [size]="18" [class]="iconColor(t.variant)" />
          <p class="text-foreground flex-1 text-sm">{{ t.message }}</p>
          @if (t.action; as action) {
            <button
              class="text-primary hover:text-brand-800 cursor-pointer text-sm font-semibold"
              (click)="runAction(t)"
            >
              {{ action.label }}
            </button>
          }
          <button
            class="text-text-subtle hover:text-foreground cursor-pointer"
            aria-label="Fermer"
            (click)="dismiss(t.id)"
          >
            <hk-icon name="lucideX" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkToaster {
  private readonly toastService = inject(ToastService);
  protected readonly toasts = this.toastService.toasts;

  protected icon(v: ToastVariant): string {
    return ICON[v];
  }
  protected iconColor(v: ToastVariant): string {
    return ICON_COLOR[v];
  }
  protected dismiss(id: number): void {
    this.toastService.dismiss(id);
  }

  protected runAction(toast: Toast): void {
    toast.action?.run();
    this.toastService.dismiss(toast.id);
  }
}
