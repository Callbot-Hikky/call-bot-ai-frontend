import { MenuFile } from '@core/models/menu.model';

/**
 * Une ligne de fichier prete a afficher : la page calcule l'adresse d'apercu et
 * la taille lisible une seule fois, les sections ne font plus que du rendu.
 */
export interface MenuFileRow {
  file: MenuFile;
  /** Adresse admin verifiee, ou null si sa forme ne correspond pas a la notre. */
  previewUrl: string | null;
  /** Taille deja mise en forme : « 1,2 Mo ». */
  size: string;
}

/** Un cran vers le haut ou vers le bas, avec le fichier concerne. */
export interface MenuFileMove {
  id: string;
  direction: -1 | 1;
}
