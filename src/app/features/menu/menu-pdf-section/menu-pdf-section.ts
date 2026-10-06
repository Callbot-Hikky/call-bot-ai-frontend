import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
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
  /** Vrai quand ce mode est celui que les clients voient deja. */
  readonly published = input(true);
  readonly canAdd = input(false);
  readonly busy = input(false);
  readonly pendingFileId = input<string | null>(null);

  readonly accept = input.required<string[]>();
  readonly maxBytes = input.required<number>();
  readonly maxCount = input.required<number>();
  readonly hint = input('');
  readonly pendingText = input('');
  readonly publishLabel = input('Publier');

  readonly filesPicked = output<File[]>();
  readonly moved = output<MenuFileMove>();
  readonly removeAsked = output<string>();
  readonly removeConfirmed = output<void>();
  readonly removeCancelled = output<void>();
  readonly publishAsked = output<void>();
}
