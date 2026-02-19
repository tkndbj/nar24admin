// src/config/productSpecSchema.ts

export const SPEC_FIELDS = {
  productType: { label: "Ürün Tipi", type: "string" },
  clothingSizes: { label: "Beden", type: "string[]" },
  clothingFit: { label: "Kalıp", type: "string" },
  clothingTypes: { label: "Giysi Tipi", type: "string[]" },
  pantSizes: { label: "Pantolon Bedeni", type: "string[]" },
  pantFabricTypes: { label: "Kumaş Tipi", type: "string[]" },
  footwearSizes: { label: "Ayakkabı Numarası", type: "string[]" },
  jewelryMaterials: { label: "Malzemeler", type: "string[]" },
  consoleBrand: { label: "Konsol Markası", type: "string" },
  curtainMaxWidth: { label: "Maks. Genişlik", type: "number" },
  curtainMaxHeight: { label: "Maks. Yükseklik", type: "number" },
} as const;

export type SpecFieldKey = keyof typeof SPEC_FIELDS;
export type SpecFieldType = "string" | "string[]" | "number";

// TypeScript mapped type so interfaces stay in sync automatically
type FieldValueType<T extends SpecFieldType> = T extends "string[]"
  ? string[]
  : T extends "number"
    ? number
    : string;

export type SpecFieldValues = {
  [K in SpecFieldKey]?: FieldValueType<(typeof SPEC_FIELDS)[K]["type"]> | null;
};

// Legacy attributes map keys that map to the same concept
// Used for backward compat when reading old products
export const LEGACY_ATTRIBUTE_MAP: Partial<Record<SpecFieldKey, string[]>> = {
  productType: [
    "kitchenAppliance",
    "whiteGood",
    "computerComponent",
    "consoleBrand",
    "fantasyWearType",
    "selectedFantasyWearType",
  ],
  clothingSizes: ["clothingSize"],
  clothingTypes: ["clothingType"],
  pantFabricTypes: ["pantFabricType"],
  jewelryMaterials: ["jewelryMaterial"],
};

// Old attributes that should be deleted when plural/new form exists
// (used in handleApprove cleanup)
export const LEGACY_FIELDS_TO_DELETE: Partial<Record<SpecFieldKey, string>> = {
  clothingTypes: "attributes.clothingType",
  pantFabricTypes: "attributes.pantFabricType",
};

// Helper: get display name for any key (spec or legacy)
const LEGACY_DISPLAY_NAMES: Record<string, string> = {
  gender: "Cinsiyet",
  footwearGender: "Cinsiyet",
  jewelryType: "Takı Tipi",
  consoleVariant: "Konsol Varyantı",
  kitchenAppliance: "Mutfak Aleti",
  whiteGood: "Beyaz Eşya",
  fantasyWearType: "Fantezi Giyim Tipi",
  selectedFantasyWearType: "Fantezi Giyim Tipi",
  computerComponent: "Bilgisayar Parçası",
};

export function getFieldLabel(key: string): string {
  if (key in SPEC_FIELDS) {
    return SPEC_FIELDS[key as SpecFieldKey].label;
  }
  return (
    LEGACY_DISPLAY_NAMES[key] ??
    key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, " $1")
  );
}

// Helper: resolve a spec field value from either new format or old attributes map
export function resolveSpecField<K extends SpecFieldKey>(
  key: K,
  topLevel: unknown,
  attributes?: Record<string, unknown>,
): FieldValueType<(typeof SPEC_FIELDS)[K]["type"]> | null {
  // New format: top-level field exists
  if (topLevel !== undefined && topLevel !== null) {
    return topLevel as FieldValueType<(typeof SPEC_FIELDS)[K]["type"]>;
  }

  // Old format: check legacy attribute keys
  const legacyKeys = LEGACY_ATTRIBUTE_MAP[key] ?? [];
  for (const legacyKey of legacyKeys) {
    const val = attributes?.[legacyKey];
    if (val !== undefined && val !== null) {
      return val as FieldValueType<(typeof SPEC_FIELDS)[K]["type"]>;
    }
  }

  // Also check same key in attributes (transitional products)
  const sameKey = attributes?.[key];
  if (sameKey !== undefined && sameKey !== null) {
    return sameKey as FieldValueType<(typeof SPEC_FIELDS)[K]["type"]>;
  }

  return null;
}

// Helper: extract all spec fields from a Firestore document data object
export function extractSpecFields(
  data: Record<string, unknown>,
): SpecFieldValues {
  const result: SpecFieldValues = {};
  for (const key of Object.keys(SPEC_FIELDS) as SpecFieldKey[]) {
    const resolved = resolveSpecField(
      key,
      data[key],
      data.attributes as Record<string, unknown>,
    );
    (result as Record<string, unknown>)[key] = resolved;
  }
  return result;
}

// Helper: build the spec portion of a Firestore update payload
// Sets missing fields to null so stale values are cleared
export function buildSpecUpdatePayload(
  source: SpecFieldValues,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of Object.keys(SPEC_FIELDS) as SpecFieldKey[]) {
    payload[key] = (source as Record<string, unknown>)[key] ?? null;
  }
  return payload;
}
