/**
 * Resolve a selected product variation from any selector shape used by the
 * storefront/cart APIs. Keeping this in one place prevents the cart preview
 * and final order from silently choosing different prices.
 */
export const resolveProductVariation = (product: any, selector: any) => {
  const variations = Array.isArray(product?.variations) ? product.variations : [];
  if (variations.length === 0) return undefined;

  if (typeof selector === "number" && Number.isInteger(selector)) {
    return variations[selector];
  }

  const rawSelector =
    selector && typeof selector === "object"
      ? selector._id ?? selector.id ?? selector.value ?? selector.title ?? selector.pack
      : selector;

  if (rawSelector == null || rawSelector === "") {
    return variations[0];
  }

  const normalizedSelector = String(rawSelector);
  return variations.find((variation: any) =>
    [variation?._id, variation?.id, variation?.value, variation?.title, variation?.pack]
      .filter((value) => value != null)
      .some((value) => String(value) === normalizedSelector),
  );
};

export const calculateProductUnitPrice = (product: any, selector?: any): number => {
  const variation = resolveProductVariation(product, selector);

  if (Number(variation?.discPrice) > 0) return Number(variation.discPrice);
  if (Number(product?.discPrice) > 0) return Number(product.discPrice);
  return Number(variation?.price ?? product?.price ?? 0);
};
