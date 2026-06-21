import { Injectable, signal } from '@angular/core';

export type ToastVariant = 'default' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

// File de toasts en signal, déclenchable depuis n'importe où. Auto-dismiss après 3s.
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();
  private counter = 0;

  show(message: string, variant: ToastVariant = 'default'): void {
    const id = ++this.counter;
    this._toasts.update((list) => [...list, { id, message, variant }]);
    setTimeout(() => this.dismiss(id), 3000);
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
