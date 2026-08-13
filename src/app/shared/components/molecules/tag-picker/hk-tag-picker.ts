import { Component, input, model } from "@angular/core";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmCommandImports } from '@spartan-ng/helm/command';
import { HlmPopoverImports } from '@spartan-ng/helm/popover';
import { HkChip } from "../../atoms/chip/hk-chip";
import { isoToEmoji } from "@core/utils/format";

export interface SuggestionItem {
    name: string
    country: string
}

export interface SuggestionType {
    readonly groupName: string
    readonly suggestions: readonly string[] | readonly SuggestionItem[]
}

@Component({
    selector: 'hk-tag-picker',
    imports: [
        HlmButton,
        HlmCommandImports,
        HlmPopoverImports,
        HkChip
    ],
    template: `
        <div class="flex flex-wrap items-center gap-2">
            <p class="shrink-0">
                {{ label() }} :
            </p>

            @for (item of selected(); track item) {
                <hk-chip
                    [label]="item"
                    (delete)="deleteChip($event)"
                />
            }

            <hlm-popover align="start" sideOffset="5">
                <button hlmPopoverTrigger hlmBtn variant="outline">Ajouter</button>
                
                <hlm-popover-content class="grid w-80 gap-4" *hlmPopoverPortal="let ctx">
                    <hlm-command>
                        <hlm-command-input [placeholder]="placeholder()" />
                        
                        <hlm-command-list>
                            <div *hlmCommandEmptyState hlmCommandEmpty>No results found.</div>

                            @for (group of suggestions(); track group.groupName; let last = $last) {
                                <hlm-command-group>
                                    @if (group.groupName) {
                                        <hlm-command-group-label>
                                            {{ group.groupName }}
                                        </hlm-command-group-label>
                                    }

                                    @for (item of group.suggestions; track getItemLabel(item)) {
                                        @if (!isAlreadyPicked(getItemLabel(item))) {
                                            <button
                                                hlm-command-item
                                                [value]="getItemLabel(item)"
                                                (selected)="addChip(getItemLabel(item))"
                                            >
                                                @if (getItemCountry(item) && typeof item !== 'string') {
                                                    <p>{{ isoToEmoji(getItemCountry(item)) }}</p>
                                                }
    
                                                {{ getItemLabel(item) }}
                                            </button>
                                        }
                                    }
                                </hlm-command-group>

                                @if (!last) {
                                    <hlm-command-separator />
                                }
                            }
                        </hlm-command-list>
                    </hlm-command>
                </hlm-popover-content>
            </hlm-popover>
        </div>
    `
})

export class HkTagPicker {
    label = input.required<string>()

    placeholder = input.required<string>()

    suggestions = input.required<readonly SuggestionType[]>()

    selected = model<string[]>([])

    protected readonly isoToEmoji = isoToEmoji;

    getItemLabel(item: string | SuggestionItem): string {
        return typeof item === 'string' ? item : item.name;
    }

    getItemCountry(item: string | SuggestionItem): string {
        return typeof item === 'string' ? item : item.country;
    }

    addChip(chip: string): void {
        if (!this.selected().includes(chip)) {
            this.selected.update(current => [...current, chip])
        }
    }

    deleteChip(chip: string): void {
        this.selected.update(current => current.filter(label => label !== chip))
    }

    isAlreadyPicked(chip: string): boolean {
        return this.selected().includes(chip)
    }
}
