import type { Country } from "./company.ts";
import type { Rng } from "./random.ts";

/** Brand-name parts for account names. Combined, they read like real firms. */
const BRAND_PREFIXES = [
  "Blue", "Iron", "Silver", "North", "Stone", "Bright", "Cedar", "Harbor", "Summit", "Clear",
  "Oak", "Pine", "River", "Granite", "Copper", "Maple", "Falcon", "Atlas", "Beacon", "Crest",
  "Lake", "Ridge", "West", "East", "Prairie", "Union", "Keystone", "Pioneer", "Meridian", "Sterling",
];
const BRAND_SUFFIXES = [
  "gate", "wood", "line", "field", "bridge", "point", "view", "stone", "brook", "haven",
  "path", "works", "port", "crest", "well", "ford", "mark", "dale", "light", "side",
];
const INDUSTRY_NOUNS: Record<string, readonly string[]> = {
  Logistics: ["Logistics", "Freight", "Distribution", "Transport"],
  Healthcare: ["Health", "Medical Group", "Clinics", "Care Partners"],
  Manufacturing: ["Manufacturing", "Industries", "Fabrication", "Components"],
  Retail: ["Retail", "Outfitters", "Supply Co.", "Markets"],
  "Financial Services": ["Capital", "Financial", "Credit Union", "Advisors"],
  Construction: ["Construction", "Builders", "Contracting", "Engineering"],
  Hospitality: ["Hotels", "Hospitality", "Resorts", "Restaurant Group"],
  Education: ["Academy", "Learning", "Schools", "University"],
  "Professional Services": ["Consulting", "Partners", "Advisory", "Group"],
  "Real Estate": ["Properties", "Realty", "Property Management", "Estates"],
  Energy: ["Energy", "Power", "Utilities", "Renewables"],
  Media: ["Media", "Studios", "Publishing", "Creative"],
  Nonprofit: ["Foundation", "Alliance", "Trust", "Community Fund"],
  Insurance: ["Insurance", "Mutual", "Assurance", "Underwriters"],
  Telecommunications: ["Telecom", "Networks", "Communications", "Fiber"],
  "Public Sector": ["County Services", "Transit Authority", "Water District", "City Services"],
};

const ROMAJI_GIVEN = ["Haruto", "Yuto", "Sota", "Ren", "Hina", "Yui", "Aoi", "Sakura", "Takumi", "Kenji", "Mei", "Riko", "Daiki", "Naoko", "Shota", "Emi"];
const ROMAJI_FAMILY = ["Sato", "Suzuki", "Takahashi", "Tanaka", "Watanabe", "Ito", "Yamamoto", "Nakamura", "Kobayashi", "Kato", "Yoshida", "Yamada", "Sasaki", "Matsumoto", "Inoue", "Kimura"];

export const CONTACT_TITLES = {
  owner: ["COO", "VP of Operations", "Director of Operations", "Head of Operations", "Operations Manager"],
  admin: ["IT Manager", "Systems Administrator", "Business Systems Analyst", "Operations Analyst", "RevOps Manager"],
  member: [
    "Operations Coordinator", "Project Manager", "Account Manager", "Procurement Specialist", "HR Generalist",
    "Finance Analyst", "Office Manager", "Field Supervisor", "Customer Service Lead", "Quality Specialist",
    "Facilities Manager", "Logistics Coordinator", "Marketing Manager", "Data Analyst", "Team Lead",
  ],
  guest: ["Contractor", "Consultant", "Auditor"],
} as const;

/** Removes accents and other non-ASCII marks. */
export function ascii(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9 .&'-]/g, "");
}

export function slug(text: string): string {
  return ascii(text)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export interface Person {
  firstName: string;
  lastName: string;
  fullName: string;
}

export function personName(rng: Rng, country: Country): Person {
  if (country.locale === "ja") {
    const firstName = rng.pick(ROMAJI_GIVEN);
    const lastName = rng.pick(ROMAJI_FAMILY);
    return { firstName, lastName, fullName: `${firstName} ${lastName}` };
  }
  const faker = rng.faker(country.locale);
  const firstName = faker.person.firstName();
  const lastName = faker.person.lastName();
  return { firstName, lastName, fullName: `${firstName} ${lastName}` };
}

/**
 * An address on the reserved `.example` TLD (RFC 2606), so a seeded address
 * can never reach a real mailbox.
 */
export function emailFor(person: Person, domain: string, style: number): string {
  const first = slug(person.firstName).replace(/-/g, "") || "team";
  const last = slug(person.lastName).replace(/-/g, "") || "member";
  const local = style % 3 === 0 ? `${first}.${last}` : style % 3 === 1 ? `${first[0]}${last}` : `${first}${last[0]}`;
  return `${local}@${domain}`;
}

export function accountName(rng: Rng, country: Country, industry: string): string {
  const nouns = INDUSTRY_NOUNS[industry] ?? ["Group"];
  const style = rng.float();
  if (style < 0.42) {
    return `${rng.pick(BRAND_PREFIXES)}${rng.pick(BRAND_SUFFIXES)} ${rng.pick(nouns)}`;
  }
  if (style < 0.72 && country.locale !== "ja") {
    return `${ascii(rng.faker(country.locale).person.lastName())} ${rng.pick(nouns)}`;
  }
  return rng.faker(country.locale).company.name();
}

/** A unique `.example` domain for a company name. */
export function companyDomain(name: string, taken: Set<string>): string {
  const base = slug(name.replace(/\b(inc|llc|ltd|gmbh|ag|sa|ltda|co)\b\.?/gi, "")) || "company";
  let domain = `${base}.example`;
  for (let index = 2; taken.has(domain); index += 1) {
    domain = `${base}-${index}.example`;
  }
  taken.add(domain);
  return domain;
}

export function city(rng: Rng, country: Country): string {
  return rng.faker(country.locale).location.city();
}
