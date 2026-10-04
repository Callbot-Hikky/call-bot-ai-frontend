import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { HkPublishBanner } from '@shared/components/molecules/publish-banner/hk-publish-banner';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkFileDropzone } from '@shared/components/molecules/file-dropzone/hk-file-dropzone';
import { HkFileRowActions } from '@shared/components/molecules/file-row-actions/hk-file-row-actions';
import { HkInlineConfirm } from '@shared/components/molecules/inline-confirm/hk-inline-confirm';
import { HkPdfPages } from '@shared/components/molecules/pdf-pages/hk-pdf-pages';
import { MenuFileMove, MenuFileRow } from '../menu-file-row';

/**
 * La zone de preparation du mode PDF. Elle n'enregistre rien et ne connait pas
 * le service : elle affiche ce qu'on lui donne et annonce ce que l'utilisateur
 * demande. Toute la decision reste dans la page.
 */
@Component({
  selector: 'app-menu-pdf-section',
  imports: [HkIcon, HkFileDropzone, HkFileRowActions, HkInlineConfirm, HkPdfPages, HkPublishBanner],
  templateUrl: './menu-pdf-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuPdfSection {
  readonly files = input.required<MenuFileRow[]>();
  /**
   * Vrai quand la publication doit etre proposee ICI : un autre format est en
   * ligne, donc le bandeau de la page ne propose pas celui-ci.
   */
  readonly canPublishHere = input(false);
  readonly busy = input(false);
  readonly pendingFileId = input<string | null>(null);

  readonly accept = input.required<string[]>();
  readonly maxBytes = input.required<number>();
  readonly maxCount = input.required<number>();
  readonly hint = input('');
  readonly pendingText = input.required<string>();
  readonly publishLabel = input.required<string>();

  // Calcule ici et non recu : la section connait deja la liste et la limite, et
  // les affiche cote a cote. Le faire aussi dans la page, c'est risquer d'afficher
  // « 5/5 » avec la zone de depot encore ouverte.
  protected readonly canAdd = computed(() => this.files().length < this.maxCount());

  readonly filesPicked = output<File[]>();
  readonly moved = output<MenuFileMove>();
  readonly removeAsked = output<string>();
  readonly removeConfirmed = output<void>();
  readonly removeCancelled = output<void>();
  readonly publishAsked = output<void>();
}
