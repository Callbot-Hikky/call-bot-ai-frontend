import { ChangeDetectionStrategy, Component, computed, output, signal } from '@angular/core';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import {
  PascalCandidate,
  PascalImportResult,
  parsePascalScene,
} from '@core/models/pascal-import.model';

// Taille max acceptee pour l'export JSON (les scenes Pascal font < 5 Mo).
const MAX_FILE_BYTES = 20 * 1024 * 1024;

// Dialogue d'import d'un plan depuis Pascal Editor (scan 3D / editeur web).
//
// FLUX : le restaurateur scanne sa salle (Pascal Capture) ou la dessine dans
// editor.pascal.app, puis « Export Scene (JSON) ». Ici : depot du fichier ->
// apercu (mini plan SVG + liste des meubles detectes, tables pre-cochees) ->
// « Importer » emet les candidats retenus ; l'EDITEUR cree les vraies tables
// (POST /api/tables) et pose leur geometrie. Aucune table existante n'est
// modifiee ni supprimee par l'import.
@Component({
  selector: 'hk-pascal-import',
  imports: [HkButton, HkIcon],
  template: `
    <div
      class="fixed inset-0 z-[1030] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Importer un plan Pascal"
      tabindex="-1"
      (click)="onBackdrop($event)"
      (keydown.escape)="closed.emit()"
    >
      <div
        class="bg-card border-border flex max-h-[85vh] w-full max-w-2xl flex-col gap-4 overflow-y-auto rounded-md border p-6 shadow-xl"
        data-testid="pascal-import-dialog"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex flex-col gap-1">
            <h2 class="text-text-strong text-lg font-semibold">Importer un plan 3D (Pascal)</h2>
            <p class="text-text-subtle text-sm">
              Scannez votre salle avec l’app Pascal Capture (iPhone) ou dessinez-la sur
              editor.pascal.app, puis « Export Scene (JSON) » et déposez le fichier ici.
            </p>
          </div>
          <hk-button variant="ghost" size="sm" aria-label="Fermer" (click)="closed.emit()">
            <hk-icon name="lucideX" [size]="16" />
          </hk-button>
        </div>

        @if (!result()) {
          <!-- Etape 1 : depot du fichier -->
          <label
            data-testid="pascal-dropzone"
            class="border-border hover:border-primary hover:bg-muted flex cursor-pointer flex-col items-center gap-2 rounded-md border-2 border-dashed p-10 text-center transition-colors"
            [class.border-primary]="dragging()"
            [class.bg-muted]="dragging()"
            (dragover)="onDragOver($event)"
            (dragleave)="dragging.set(false)"
            (drop)="onDrop($event)"
          >
            <hk-icon name="lucideDownload" [size]="28" class="text-text-subtle" />
            <span class="text-text-strong text-sm font-medium">
              Glissez votre export JSON ici
            </span>
            <span class="text-text-subtle text-xs">ou cliquez pour choisir le fichier</span>
            <input
              type="file"
              accept=".json,application/json"
              class="hidden"
              data-testid="pascal-file-input"
              (change)="onFilePicked($event)"
            />
          </label>
          @if (error(); as msg) {
            <p class="text-st-cancelled-fg text-sm" role="alert" data-testid="pascal-error">
              {{ msg }}
            </p>
          }
        } @else if (result(); as r) {
          <!-- Etape 2 : apercu + selection -->
          <div class="flex flex-col gap-3">
            <p class="text-text-strong text-sm" data-testid="pascal-recap">
              {{ r.itemCount }} meuble(s) détecté(s) · {{ r.tableCount }} table(s) ·
              {{ r.wallCount }} mur(s)
            </p>

            <!-- Mini plan : murs + meubles (les coches pilotent la couleur). -->
            <svg
              viewBox="0 0 160 100"
              class="border-border bg-background w-full rounded-md border"
              role="img"
              aria-label="Aperçu du plan importé"
            >
              @for (w of r.walls; track $index) {
                <line
                  [attr.x1]="w.x1 * 160"
                  [attr.y1]="w.y1 * 100"
                  [attr.x2]="w.x2 * 160"
                  [attr.y2]="w.y2 * 100"
                  stroke="var(--color-border-strong, #94a3b8)"
                  [attr.stroke-width]="Math.max(1.5, w.thickness * 100)"
                  stroke-linecap="round"
                />
              }
              @for (c of r.candidates; track c.key) {
                @if (c.shape === 'round') {
                  <circle
                    [attr.cx]="c.x * 160"
                    [attr.cy]="c.y * 100"
                    [attr.r]="(c.w * 100) / 2"
                    [attr.fill]="isSelected(c) ? 'var(--color-primary, #16a34a)' : '#cbd5e1'"
                    [attr.opacity]="isSelected(c) ? 0.85 : 0.5"
                  />
                } @else {
                  <rect
                    [attr.x]="c.x * 160 - (c.w * 100) / 2"
                    [attr.y]="c.y * 100 - (c.h * 100) / 2"
                    [attr.width]="c.w * 100"
                    [attr.height]="c.h * 100"
                    rx="1.5"
                    [attr.fill]="isSelected(c) ? 'var(--color-primary, #16a34a)' : '#cbd5e1'"
                    [attr.opacity]="isSelected(c) ? 0.85 : 0.5"
                    [attr.transform]="
                      'rotate(' + c.rotation + ' ' + c.x * 160 + ' ' + c.y * 100 + ')'
                    "
                  />
                }
              }
            </svg>

            <!-- Liste des meubles : tables pre-cochees, le reste decochable a la main. -->
            <ul class="flex max-h-52 flex-col gap-1 overflow-y-auto" data-testid="pascal-list">
              @for (c of r.candidates; track c.key) {
                <li>
                  <label
                    class="hover:bg-muted flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5"
                  >
                    <input
                      type="checkbox"
                      class="accent-primary size-3.5"
                      [attr.data-testid]="'pascal-check-' + c.key"
                      [checked]="isSelected(c)"
                      (change)="toggle(c)"
                    />
                    <span class="text-text-strong min-w-0 flex-1 truncate text-sm">
                      {{ c.label }}
                    </span>
                    <span class="text-text-subtle font-mono text-xs tabular-nums">
                      {{ c.widthM }} × {{ c.depthM }} m
                    </span>
                    @if (c.isTable) {
                      <span class="text-text-subtle text-xs">~{{ c.capacity }} couverts</span>
                    }
                  </label>
                </li>
              }
            </ul>

            <p class="text-text-subtle text-xs">
              Chaque élément coché devient une vraie table (capacité estimée, corrigez ensuite dans
              les propriétés). Vos tables existantes sont conservées.
            </p>

            <div class="flex items-center justify-end gap-2">
              <hk-button variant="ghost" size="sm" (click)="reset()">Autre fichier</hk-button>
              <hk-button
                size="sm"
                data-testid="pascal-apply"
                [disabled]="selectedCount() === 0"
                (click)="apply()"
              >
                Importer {{ selectedCount() }} table(s)
              </hk-button>
            </div>
          </div>
        }
      </div>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HkPascalImport {
  // Ferme le dialogue sans importer.
  readonly closed = output<void>();
  // Candidats retenus : l'editeur cree les tables + geometrie.
  readonly imported = output<PascalCandidate[]>();

  protected readonly Math = Math;

  protected readonly result = signal<PascalImportResult | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly dragging = signal(false);
  // Cles des candidats coches (pre-remplies avec les tables detectees).
  private readonly selectedKeys = signal<ReadonlySet<string>>(new Set());

  protected readonly selectedCount = computed(() => this.selectedKeys().size);

  // Parse un texte JSON (appele par depot de fichier ET par les tests).
  loadText(text: string): void {
    const parsed = parsePascalScene(text);
    if (!parsed.ok) {
      this.error.set(parsed.error ?? 'Import impossible.');
      this.result.set(null);
      return;
    }
    this.error.set(null);
    this.result.set(parsed);
    this.selectedKeys.set(new Set(parsed.candidates.filter((c) => c.isTable).map((c) => c.key)));
  }

  protected isSelected(c: PascalCandidate): boolean {
    return this.selectedKeys().has(c.key);
  }

  protected toggle(c: PascalCandidate): void {
    this.selectedKeys.update((keys) => {
      const next = new Set(keys);
      if (next.has(c.key)) {
        next.delete(c.key);
      } else {
        next.add(c.key);
      }
      return next;
    });
  }

  protected apply(): void {
    const r = this.result();
    if (!r) {
      return;
    }
    const keys = this.selectedKeys();
    this.imported.emit(r.candidates.filter((c) => keys.has(c.key)));
  }

  protected reset(): void {
    this.result.set(null);
    this.error.set(null);
    this.selectedKeys.set(new Set());
  }

  // --- Lecture de fichier -------------------------------------------------------

  protected onFilePicked(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.readFile(file);
    }
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      this.readFile(file);
    }
  }

  // Clic sur le fond sombre = fermer (mais pas les clics DANS la carte).
  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }

  private readFile(file: File): void {
    if (file.size > MAX_FILE_BYTES) {
      this.error.set('Fichier trop volumineux (20 Mo max).');
      return;
    }
    file
      .text()
      .then((text) => this.loadText(text))
      .catch(() => this.error.set('Impossible de lire le fichier.'));
  }
}
