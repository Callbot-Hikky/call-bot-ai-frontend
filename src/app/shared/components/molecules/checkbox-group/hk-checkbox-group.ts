import { Component, input, model } from "@angular/core";
import { HkIcon } from "@shared/components/atoms/icon/hk-icon";
import { HlmLabelImports } from '@spartan-ng/helm/label';
import { HlmRadioGroupImports } from '@spartan-ng/helm/radio-group';
import { HlmCheckboxImports } from '@spartan-ng/helm/checkbox';

export interface CheckboxGroupCheckboxesType {
    id: string
    label: string
}

@Component({
    selector: 'hk-checkbox-group',
    imports: [
        HlmLabelImports,
        HlmRadioGroupImports,
        HlmCheckboxImports,
        HkIcon
    ],
    template: `
        <div class="flex flex-col gap-4">
            <div class="flex items-center gap-2">
                <span
                    class="flex size-8 items-center justify-center rounded-lg bg-green-100 text-green-700"
                >
                    <hk-icon [name]="iconName()" [size]="16" />
                </span>

                <h2 class="text-sm font-semibold text-green-900">
                    {{ title() }}
                </h2>
            </div>
            
            <div class="grid lg:grid-cols-2">
                @for (checkbox of checkboxes(); track checkbox.id) {
                    <div class="flex items-center gap-2">
                        <hlm-checkbox
                            [id]="id() + '-' + checkbox.id"
                            [checked]="selected().includes(checkbox.id)"
                            (checkedChange)="toggleCheckbox(checkbox.id)"
                        />

                        <label [for]="id() + '-' + checkbox.id">
                            {{ checkbox.label }}
                        </label>
                    </div>
                }
            </div>
        </div>
    `
})

export class HkCheckboxGroup {
    id = input.required<string>()

    title = input.required<string>()

    iconName = input.required<string>()

    checkboxes = input.required<readonly CheckboxGroupCheckboxesType[]>()

    selected = model<string[]>([])

    toggleCheckbox(id: string) {
        this.selected.update(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id])
    }
}
