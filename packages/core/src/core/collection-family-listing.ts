import { belongsToCollectionFamily } from "./collection-naming.js";

/**
 * Phase 8.3 - collection-family listing over a narrow vector-store port.
 * Preserves the backend-enumeration behavior: filter-and-sort from the full
 * listing, with a per-family hasCollection probe fallback.
 */

export type CollectionFamilyListingPort = {
    listCollections(): Promise<string[]>;
    hasCollection(collectionName: string): Promise<boolean>;
};

export async function listRelatedCollectionNames(
    port: CollectionFamilyListingPort,
    activeFamilyName: string,
    alternateFamilyName: string,
): Promise<string[]> {
    try {
        const collectionNames = await port.listCollections();
        return collectionNames
            .filter((collectionName) =>
                belongsToCollectionFamily(collectionName, activeFamilyName)
                || belongsToCollectionFamily(collectionName, alternateFamilyName)
            )
            .sort((left, right) => left.localeCompare(right));
    } catch {
        const fallbackNames = [activeFamilyName, alternateFamilyName];
        const existingNames: string[] = [];
        for (const familyName of fallbackNames) {
            try {
                if (await port.hasCollection(familyName)) {
                    existingNames.push(familyName);
                }
            } catch {
                continue;
            }
        }
        return existingNames.sort((left, right) => left.localeCompare(right));
    }
}
