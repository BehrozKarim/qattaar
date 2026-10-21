import { VARIANTS } from '../game/variants';
import type { Variant } from '../game/variants';

interface Props { variant: Variant; disabled: boolean; inRoom: boolean; onChange(variant: Variant): void }

export function VariantPicker({ variant, disabled, inRoom, onChange }: Props) {
  return <div className="variant-section">
    <span id="variant-label">{inRoom ? 'Room rules · chosen by host' : 'Game rules'}</span>
    <div className="variant-control" role="group" aria-labelledby="variant-label">
      {(Object.keys(VARIANTS) as Variant[]).map((id) => <button key={id} className={id === variant ? 'selected-variant' : ''} aria-label={VARIANTS[id].name} aria-pressed={id === variant} disabled={disabled} onClick={() => { if (id !== variant) onChange(id); }}>{VARIANTS[id].shortName}</button>)}
    </div>
    <p>{VARIANTS[variant].description}</p>
  </div>;
}
