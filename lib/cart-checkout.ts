import type { CartLine } from "./types";

export type CheckoutLine = {
  productId: string;
  partNumber: string;
  storeId?: string;
  cartEntryId?: string;
  quantity: number;
};

export function removePurchasedItems(cart: CartLine[], purchased: CheckoutLine[]) {
  return cart.flatMap((line) => {
    const match = purchased.find((item) =>
      item.storeId === line.storeId &&
      item.cartEntryId === line.cartEntryId &&
      (item.productId === line.product.id || (item.partNumber && item.partNumber === line.product.partNumber))
    );
    if (!match) return [line];
    const remaining = line.quantity - match.quantity;
    return remaining > 0 ? [{ ...line, quantity: remaining }] : [];
  });
}
