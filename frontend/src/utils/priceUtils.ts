import { Product } from '../types/domain';

export interface CalculatedPrice {
  displayPrice: number;
  mrp: number;
  discount: number;
  hasDiscount: boolean;
}

const resolveVariation = (product: any, variationSelector?: unknown) => {
  const variations = Array.isArray(product?.variations) ? product.variations : [];

  if (typeof variationSelector === 'number' && Number.isInteger(variationSelector)) {
    return variations[variationSelector];
  }

  const rawSelector = variationSelector && typeof variationSelector === 'object'
    ? (variationSelector as any)._id ??
      (variationSelector as any).id ??
      (variationSelector as any).value ??
      (variationSelector as any).title ??
      (variationSelector as any).pack
    : variationSelector;

  if (rawSelector == null || rawSelector === '') {
    return variations[0];
  }

  const normalizedSelector = String(rawSelector);
  return variations.find((variation: any) =>
    [variation?._id, variation?.id, variation?.value, variation?.title, variation?.pack]
      .filter((value) => value != null)
      .some((value) => String(value) === normalizedSelector),
  );
};

export const calculateProductPrice = (product: any, variationSelector?: unknown): CalculatedPrice => {
  if (!product) {
    return {
      displayPrice: 0,
      mrp: 0,
      discount: 0,
      hasDiscount: false
    };
  }

  const variation = resolveVariation(product, variationSelector);

  const displayPrice = (variation?.discPrice && variation.discPrice > 0)
    ? variation.discPrice
    : (product.discPrice && product.discPrice > 0)
    ? product.discPrice
    : (variation?.price || product.price || 0);

  const mrp = variation?.price || product.mrp || product.compareAtPrice || product.price || 0;

  const hasDiscount = mrp > displayPrice;
  const discount = hasDiscount ? Math.round(((mrp - displayPrice) / mrp) * 100) : 0;

  return {
    displayPrice,
    mrp,
    discount,
    hasDiscount
  };
};
