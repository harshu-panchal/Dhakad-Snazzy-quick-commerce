import api from "./config";

export type ProductViewSource = "direct" | "home" | "search" | "category" | "store" | "reel" | "wishlist" | "order-again" | "similar-product" | "promotion";

export async function recordProductView(productId: string, source: ProductViewSource = "direct", campaignId?: string) {
  const eventId = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const response = await api.post("/customer/product-engagements/view", { eventId, productId, source, campaignId });
  return response.data;
}

export async function clearProductActivity() {
  const response = await api.delete("/customer/product-engagements");
  return response.data;
}
