import { Faker, base, de, en, en_AU, en_CA, en_GB, en_IN, en_US, es_MX, fr, ja, nl, pt_BR } from "@faker-js/faker";
import type { Randomizer } from "@faker-js/faker";

/** Faker locales that the generator uses. Each region picks from these. */
export const LOCALES = {
  en_US: [en_US, en, base],
  en_CA: [en_CA, en, base],
  en_GB: [en_GB, en, base],
  de: [de, en, base],
  fr: [fr, en, base],
  nl: [nl, en, base],
  en_AU: [en_AU, en, base],
  en_IN: [en_IN, en, base],
  ja: [ja, en, base],
  es_MX: [es_MX, en, base],
  pt_BR: [pt_BR, en, base],
} as const;

export type LocaleKey = keyof typeof LOCALES;

/** cyrb128 string hash. It gives four 32-bit seeds for sfc32. */
function cyrb128(text: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    h1 = h2 ^ Math.imul(h1 ^ code, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ code, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ code, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ code, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/**
 * sfc32 generator. It is fast and has a 128-bit state, so one stream can
 * feed both the numeric helpers and faker without a visible pattern.
 */
class Sfc32 implements Randomizer {
  #a = 0;
  #b = 0;
  #c = 0;
  #d = 0;

  constructor(text: string) {
    this.reset(text);
  }

  reset(text: string): void {
    [this.#a, this.#b, this.#c, this.#d] = cyrb128(text);
    for (let index = 0; index < 12; index += 1) {
      this.next();
    }
  }

  // Faker calls `next` and `seed` without `this`, so both are arrow functions.
  next = (): number => {
    this.#a >>>= 0;
    this.#b >>>= 0;
    this.#c >>>= 0;
    this.#d >>>= 0;
    let t = (this.#a + this.#b) | 0;
    this.#a = this.#b ^ (this.#b >>> 9);
    this.#b = (this.#c + (this.#c << 3)) | 0;
    this.#c = (this.#c << 21) | (this.#c >>> 11);
    this.#d = (this.#d + 1) | 0;
    t = (t + this.#d) | 0;
    this.#c = (this.#c + t) | 0;
    return (t >>> 0) / 4294967296;
  };

  seed = (seed: number | number[]): void => {
    this.reset(Array.isArray(seed) ? seed.join(",") : String(seed));
  };
}

export interface Weighted<T> {
  value: T;
  weight: number;
}

/**
 * A deterministic random stream. `fork` gives an independent stream for a
 * label, so a change in one domain does not move the values of another.
 */
export class Rng {
  readonly #seed: string;
  readonly #label: string;
  readonly #random: Sfc32;
  readonly #fakers = new Map<LocaleKey, Faker>();
  #spare: number | undefined;

  constructor(seed: string, label = "root") {
    this.#seed = seed;
    this.#label = label;
    this.#random = new Sfc32(`${seed}::${label}`);
  }

  fork(label: string): Rng {
    return new Rng(this.#seed, `${this.#label}/${label}`);
  }

  /** A faker instance for a locale. It reads from this stream. */
  faker(locale: LocaleKey = "en_US"): Faker {
    let instance = this.#fakers.get(locale);
    if (!instance) {
      instance = new Faker({ locale: [...LOCALES[locale]], randomizer: this.#random });
      this.#fakers.set(locale, instance);
    }
    return instance;
  }

  /** A float in [0, 1). */
  float(): number {
    return this.#random.next();
  }

  between(min: number, max: number): number {
    return min + (max - min) * this.float();
  }

  /** An integer in [min, max], both included. */
  int(min: number, max: number): number {
    return Math.floor(this.between(min, max + 1));
  }

  chance(probability: number): boolean {
    return this.float() < probability;
  }

  normal(mean = 0, deviation = 1): number {
    if (this.#spare !== undefined) {
      const value = this.#spare;
      this.#spare = undefined;
      return mean + deviation * value;
    }
    let u = 0;
    while (u === 0) u = this.float();
    const v = this.float();
    const radius = Math.sqrt(-2 * Math.log(u));
    this.#spare = radius * Math.sin(2 * Math.PI * v);
    return mean + deviation * radius * Math.cos(2 * Math.PI * v);
  }

  /** A lognormal value. `median` is the 50th percentile. */
  lognormal(median: number, sigma: number): number {
    return median * Math.exp(sigma * this.normal());
  }

  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 40) {
      return Math.max(0, Math.round(this.normal(lambda, Math.sqrt(lambda))));
    }
    const limit = Math.exp(-lambda);
    let product = this.float();
    let count = 0;
    while (product > limit) {
      product *= this.float();
      count += 1;
    }
    return count;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Cannot pick from an empty list");
    return items[Math.floor(this.float() * items.length)] as T;
  }

  weighted<T>(items: readonly Weighted<T>[]): T {
    const total = items.reduce((sum, item) => sum + Math.max(0, item.weight), 0);
    if (total <= 0) throw new Error("Weights must add up to more than zero");
    let target = this.float() * total;
    for (const item of items) {
      target -= Math.max(0, item.weight);
      if (target < 0) return item.value;
    }
    return items[items.length - 1]!.value;
  }

  /** A Stripe-style id body: base62, fixed length. */
  token(length: number): string {
    const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    let text = "";
    for (let index = 0; index < length; index += 1) {
      text += alphabet[Math.floor(this.float() * alphabet.length)];
    }
    return text;
  }

  /** A random v4-shaped UUID. */
  uuid(): string {
    const hex = "0123456789abcdef";
    let text = "";
    for (let index = 0; index < 32; index += 1) {
      let digit = Math.floor(this.float() * 16);
      if (index === 12) digit = 4;
      if (index === 16) digit = (digit & 0x3) | 0x8;
      text += hex[digit];
      if (index === 7 || index === 11 || index === 15 || index === 19) text += "-";
    }
    return text;
  }

  shuffle<T>(items: readonly T[]): T[] {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(this.float() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
    }
    return copy;
  }
}
