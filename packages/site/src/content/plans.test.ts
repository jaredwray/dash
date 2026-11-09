import { expect, test } from "vitest";
import { cloudPlan, formatPrice } from "./plans";

test("formatPrice shows whole dollars with no cents, other amounts with cents, and a label for a custom price", () => {
  expect(formatPrice({ ...cloudPlan, price: 0 })).toBe("$0");
  expect(formatPrice({ ...cloudPlan, price: 0.1 })).toBe("$0.10");
  expect(formatPrice({ ...cloudPlan, price: 1.5 })).toBe("$1.50");
  expect(formatPrice({ ...cloudPlan, price: null, priceLabel: "Custom" })).toBe("Custom");
});
