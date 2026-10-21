import rulesets from './ruleset.json';

export const VARIANTS = {
  balochi: { ruleset: rulesets.id, name: 'Balochi Qattaar', shortName: 'Balochi', description: 'Adjacent moves, even with three pieces.' },
  classic: { ruleset: rulesets.classicId, name: 'Classic Nine Men’s Morris', shortName: 'Classic', description: 'With three pieces, fly to any empty point.' },
} as const;
export type Variant = keyof typeof VARIANTS;
export const DEFAULT_VARIANT: Variant = 'balochi';
export const variantFromRuleset = (ruleset: string): Variant | null =>
  (Object.keys(VARIANTS) as Variant[]).find((variant) => VARIANTS[variant].ruleset === ruleset) ?? null;
