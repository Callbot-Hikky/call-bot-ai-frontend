// TODO 5 : Pré-remplissage via input.required<RestaurantContext>() + this.form.patchValue(context()).
import { Component, inject } from "@angular/core";
import { HkCheckboxGroup } from '@shared/components/molecules/checkbox-group/hk-checkbox-group';
import { DIETARY_OPTIONS, EQUIPMENTS, PAYMENTS_AND_OFFERS } from "@core/constants/restaurant-context.constants";
import { RestaurantContextService } from "@core/services/restaurant-context.service";
import { KITCHEN_TYPES, MOODS } from "@core/constants/restaurant-context.constants";
import { HkIcon } from "@shared/components/atoms/icon/hk-icon";
import { HkPriceRangeSelector } from "@shared/components/molecules/price-range-selector/hk-price-range-selector";
import { HkTagPicker } from "@shared/components/molecules/tag-picker/hk-tag-picker";

@Component({
    selector: 'hk-restaurant-context-form',
    imports: [
        HkCheckboxGroup,
        HkIcon,
        HkPriceRangeSelector,
        HkTagPicker
    ],
    template: `
        <form class="flex h-full flex-col gap-8">
            <div class="flex flex-col gap-4">
                <hk-checkbox-group
                    id="dietary"
                    title="Régimes alimentaires et certifications"
                    iconName="lucideLeaf"
                    [checkboxes]="dietaryOptions"
                    [selected]="store.dietary()"
                    (selectedChange)="store.setDietary($event)"
                />

                <hk-checkbox-group
                    id="equipments"
                    title="Équipements et services"
                    iconName="lucideWrench"
                    [checkboxes]="equipments"
                    [selected]="store.equipments()"
                    (selectedChange)="store.setEquipments($event)"
                />

                <hk-checkbox-group
                    id="payments"
                    title="Paiements et offres"
                    iconName="lucideCreditCard"
                    [checkboxes]="paymentsAndOffers"
                    [selected]="store.payments()"
                    (selectedChange)="store.setPayments($event)"
                />

                <div class="flex items-center gap-2">
                    <span class="flex size-8 items-center justify-center rounded-lg bg-green-100 text-green-700">
                        <hk-icon name="lucideUtensilsCrossed" [size]="16" />
                    </span>

                    <h2 class="text-sm font-semibold text-green-900">
                        Ambiances et type de cuisine
                    </h2>
                </div>

                <hk-price-range-selector
                    label="Gamme de prix"
                    [selected]="store.priceRange()"
                    (selectedChange)="store.setPriceRange($event)"
                />

                <hk-tag-picker
                    label="Type de cuisine"
                    placeholder="Rechercher..."
                    [suggestions]="kitchenTypes"
                    [selected]="store.cuisines()"
                    (selectedChange)="store.setCuisines($event)"
                />

                <hk-tag-picker
                    label="Ambiance"
                    placeholder="Rechercher..."
                    [suggestions]="moods"
                    [selected]="store.moods()"
                    (selectedChange)="store.setMoods($event)"
                />
            </div>
        </form>
    `
})

export class HkRestaurantContextForm {
    protected store = inject(RestaurantContextService)

    readonly dietaryOptions = DIETARY_OPTIONS

    readonly equipments = EQUIPMENTS

    readonly paymentsAndOffers = PAYMENTS_AND_OFFERS

    readonly kitchenTypes = KITCHEN_TYPES

    readonly moods = MOODS
}
