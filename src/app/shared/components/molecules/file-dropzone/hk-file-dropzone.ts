import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';

// Zone de depose de fichiers (glisser-deposer ou clic). Refuse AVANT d'emettre un
// type interdit ou une taille excessive, avec un message en francais. Le type est
// juge sur le MIME annonce ici (premier filtre, immediat) ; la verification sur les
// octets est faite par le service avant l'envoi, comme le fait le back.
@Component({
  selector: 'hk-file-dropzone',
  imports: [HkIcon],
  template: `
    <label
      data-testid="file-dropzone"
      class="border-border flex flex-col items-center gap-2 rounded-md border-2 border-dashed p-8 text-center transition-colors"
      [class.cursor-pointer]="!disabled()"
      [class.hover:border-primary]="!disabled()"
      [class.hover:bg-muted]="!disabled()"
      [class.opacity-60]="disabled()"
      [class.cursor-not-allowed]="disabled()"
      [class.border-primary]="dragging()"
      [class.bg-muted]="dragging()"
      (dragover)="onDragOver($event)"
      (dragleave)="dragging.set(false)"
      (drop)="onDrop($event)"
    >
      <hk-icon name="lucideUpload" [size]="28" class="text-text-subtle" />
      <span class="text-text-strong text-sm font-medium">{{ label() }}</span>
      <span class="text-text-subtle text-xs">{{ hint() }}</span>
      <input
        type="file"
        class="hidden"
        data-testid="file-input"
        [accept]="acceptAttr()"
        [multiple]="multiple()"
        [disabled]="disabled()"
        (change)="onPicked($event)"
      />
    </label>
    @if (error(); as msg) {
      <p class="text-st-cancelled-fg mt-2 text-sm" role="alert" data-testid="dropzone-error">
        {{ msg }}
      </p>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkFileDropzone {
  // Types MIME acceptes. Vide = tout accepter (le service tranchera sur les octets).
  readonly accept = input<string[]>([]);
  readonly maxBytes = input<number>(Number.POSITIVE_INFINITY);
  readonly multiple = input(false);
  readonly disabled = input(false);
  readonly label = input('Glissez votre fichier ici');
  readonly hint = input('ou cliquez pour le choisir');

  readonly filesPicked = output<File[]>();

  protected readonly dragging = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly acceptAttr = computed(() => this.accept().join(','));

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (!this.disabled()) {
      this.dragging.set(true);
    }
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    this.handleFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  protected onPicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.handleFiles(Array.from(input.files ?? []));
    // Permet de redeposer le meme fichier apres une suppression.
    input.value = '';
  }

  protected handleFiles(files: File[]): void {
    if (this.disabled() || files.length === 0) {
      return;
    }
    const picked = this.multiple() ? files : files.slice(0, 1);
    const accepted = this.accept();
    const rejectedType = picked.find((f) => accepted.length > 0 && !accepted.includes(f.type));
    if (rejectedType) {
      this.error.set(`« ${rejectedType.name} » n'est pas accepte (${describeAccepted(accepted)}).`);
      return;
    }
    const tooBig = picked.find((f) => f.size > this.maxBytes());
    if (tooBig) {
      this.error.set(`« ${tooBig.name} » est trop volumineux (${humanSize(this.maxBytes())} max).`);
      return;
    }
    this.error.set(null);
    this.filesPicked.emit(picked);
  }
}

const MIME_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
};

function describeAccepted(accepted: string[]): string {
  return accepted.map((m) => MIME_LABELS[m] ?? m).join(', ');
}

function humanSize(bytes: number): string {
  if (!Number.isFinite(bytes)) return 'illimite';
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} Mo`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${bytes} octets`;
}
