import { Injectable, signal } from '@angular/core';

export type ToastVariant = 'default' | 'success' | 'error';

// Action optionnelle affichée dans le toast (ex. « Annuler »).
export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

// File de toasts en signal, déclenchable depuis n'importe où.
// Auto-dismiss après 3s (6s si une action est proposée, pour laisser le temps de cliquer).
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();
  private counter = 0;

  show(message: string, variant: ToastVariant = 'default', action?: ToastAction): void {
    const id = ++this.counter;
    this._toasts.update((list) => [...list, { id, message, variant, action }]);
    setTimeout(() => this.dismiss(id), action ? 6000 : 3000);
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
