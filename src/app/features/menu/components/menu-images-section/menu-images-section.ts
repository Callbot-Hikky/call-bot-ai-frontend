import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { HkButton } from '@shared/components/atoms/button/hk-button';
import { HkIcon } from '@shared/components/atoms/icon/hk-icon';
import { HkFileDropzone } from '@shared/components/molecules/file-dropzone/hk-file-dropzone';
import { HkFileRowActions } from '@shared/components/molecules/file-row-actions/hk-file-row-actions';
import { HkInlineConfirm } from '@shared/components/molecules/inline-confirm/hk-inline-confirm';
import { MenuFileMove, MenuFileRow } from '../menu-file-row';

/**
 * La zone de preparation du mode photos. Meme contrat que la section PDF :
 * elle affiche et annonce, la page decide.
 */
@Component({
  selector: 'app-menu-images-section',
  imports: [HkButton, HkIcon, HkFileDropzone, HkFileRowActions, HkInlineConfirm],
  templateUrl: './menu-images-section.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MenuImagesSection {
  readonly files = input.required<MenuFileRow[]>();
  readonly published = input(true);
  readonly canAdd = input(false);
  readonly busy = input(false);
  readonly pendingFileId = input<string | null>(null);

  readonly accept = input.required<string[]>();
  readonly maxBytes = input.required<number>();
  readonly maxCount = input.required<number>();
  readonly hint = input('');

  readonly filesPicked = output<File[]>();
  readonly moved = output<MenuFileMove>();
  readonly removeAsked = output<string>();
  readonly removeConfirmed = output<void>();
  readonly removeCancelled = output<void>();
  readonly publishAsked = output<void>();
}
