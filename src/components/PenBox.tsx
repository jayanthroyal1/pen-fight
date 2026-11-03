import { effectiveLook } from '../game/penMesh';
import { LEVEL_LABELS, penModel, type PenModelId } from '../game/pens';
import { power as powerOf, type PowerId } from '../game/powers';
import { MAX_PENS, type OwnedPen } from '../profile/economy';

/** A small side view of a pen in its own colours, or its hero's. */
export function PenSwatch({ model, power = null }: { model: PenModelId; power?: PowerId | null }) {
  const look = effectiveLook(model, power);
  const metal = look.finish === 'metal';
  const shade = (c: string) =>
    metal
      ? `linear-gradient(180deg, #f6f7f9 0%, ${c} 40%, color-mix(in srgb, ${c} 55%, black) 100%)`
      : `linear-gradient(180deg, color-mix(in srgb, ${c} 55%, white) 0%, ${c} 45%, color-mix(in srgb, ${c} 65%, black) 100%)`;
  return (
    <span className={`pen-swatch${power === 'hanuman' ? ' is-mace' : ''}`} aria-hidden>
      <span className="sw-plug" style={{ background: shade(look.plug) }} />
      <span className="sw-barrel" style={{ background: shade(look.barrel), opacity: look.finish === 'translucent' ? 0.8 : 1 }}>
        {look.finish === 'translucent' && <span className="sw-ink" style={{ background: look.ink }} />}
        <span className="sw-cap" style={{ background: shade(look.cap) }}>
          <span className="sw-clip" style={{ background: look.trim ?? 'rgba(255,255,255,0.7)' }} />
        </span>
        {look.band && <span className="sw-band" style={{ background: look.band }} />}
        {look.grip && <span className="sw-grip" style={{ background: look.grip }} />}
      </span>
      <span className="sw-nib" style={{ borderLeftColor: look.nib }} />
      <span className="sw-point" />
    </span>
  );
}

/** Name, level and power of a pen, in one line. */
export function PenLabel({ pen }: { pen: { model: PenModelId; power: PowerId | null } }) {
  const m = penModel(pen.model);
  return (
    <span className="pen-text">
      <span className="pen-name">{m.name}</span>
      <span className="pen-meta">
        Level {m.level} · {LEVEL_LABELS[m.level]}
        {pen.power && <span className="power-badge">{powerOf(pen.power).name}</span>}
      </span>
    </span>
  );
}

interface BoxProps {
  pens: OwnedPen[];
  /** Selectable: highlights the chosen pen and reports picks. */
  selected?: string | null;
  onSelect?: (uid: string) => void;
  /** Pens that can't be picked here, with the reason. */
  disabled?: (pen: OwnedPen) => string | null;
  label?: string;
  /** How many pens the box holds; a test account's has no limit. */
  limit?: number;
}

/** A player's geometry box: up to five pens in their slots. */
export function PenBox({ pens, selected, onSelect, disabled, label = 'Pencil box', limit = MAX_PENS }: BoxProps) {
  const empty = Number.isFinite(limit) ? Math.max(0, limit - pens.length) : 0;
  return (
    <fieldset className="pen-box" disabled={!onSelect}>
      <legend>
        {label} <span className="box-count">{Number.isFinite(limit) ? `${pens.length}/${limit}` : `${pens.length} pens`}</span>
      </legend>
      {pens.map((pen) => {
        const why = disabled?.(pen) ?? null;
        const isSel = selected === pen.uid;
        const inner = (
          <>
            <PenSwatch model={pen.model} power={pen.power} />
            <PenLabel pen={pen} />
            {why && <span className="slot-note">{why}</span>}
          </>
        );
        return onSelect ? (
          <label key={pen.uid} className={`pen-slot${isSel ? ' is-selected' : ''}${why ? ' is-disabled' : ''}`}>
            <input
              type="radio"
              name={label}
              className="visually-hidden"
              checked={isSel}
              disabled={!!why}
              onChange={() => onSelect(pen.uid)}
            />
            {inner}
          </label>
        ) : (
          <div key={pen.uid} className="pen-slot">
            {inner}
          </div>
        );
      })}
      {Array.from({ length: empty }, (_, i) => (
        <div key={`empty-${i}`} className="pen-slot is-empty" aria-hidden>
          empty slot
        </div>
      ))}
    </fieldset>
  );
}

/** The rupees a player has, as a coin and an amount. */
export function Rupees({ amount }: { amount: number }) {
  return (
    <span className="rupees" aria-label={`${amount} rupees`}>
      <span className="coin" aria-hidden>
        ₹
      </span>
      {amount}
    </span>
  );
}
