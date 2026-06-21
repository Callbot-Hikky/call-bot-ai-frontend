import { ChangeDetectionStrategy, Component } from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';

// Page temporaire de validation des tokens (étape design 01). À supprimer ensuite.
@Component({
  selector: 'app-tokens-demo',
  imports: [...HlmButtonImports],
  templateUrl: './tokens-demo.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TokensDemo {
  protected readonly greens = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
}
