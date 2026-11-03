import { effectiveLook } from '../game/penMesh';
import { LEVEL_LABELS, penModel, type PenModelId, type PenPattern } from '../game/pens';
import { power as powerOf, type PowerId } from '../game/powers';
import { MAX_PENS, type OwnedPen } from '../profile/economy';

/** A small side view of a pen in its own colours, or its hero's. */
export function PenSwatch({ model, power = null }: { model: PenModelId; power?: PowerId | null }) {
  const look = effectiveLook(model, power);
  const metal = look.finish === 'metal';
  const click = look.form === 'click' && power !== 'hanuman';
  const shade = (c: string) =>
    metal
      ? `linear-gradient(180deg, #f6f7f9 0%, ${c} 40%, color-mix(in srgb, ${c} 55%, black) 100%)`
      : `linear-gradient(180deg, color-mix(in srgb, ${c} 55%, white) 0%, ${c} 45%, color-mix(in srgb, ${c} 65%, black) 100%)`;
  return (
    <span className={`pen-swatch${power === 'hanuman' ? ' is-mace' : ''}${click ? ' is-click' : ''}`} aria-hidden>
      <span className="sw-plug" style={{ background: shade(look.plug) }} />
      <span className="sw-barrel" style={{ background: shade(look.barrel), opacity: look.finish === 'translucent' ? 0.8 : 1 }}>
        {look.finish === 'translucent' && <span className="sw-ink" style={{ background: look.ink }} />}
        {look.pattern && <span className="sw-pattern" style={{ background: patternCss(look.pattern) }} />}
        <span className="sw-cap" style={{ background: shade(look.cap) }}>
          <span className="sw-clip" style={{ background: look.trim ?? 'rgba(255,255,255,0.7)' }} />
        </span>
        {look.sliders && (
          <span className="sw-sliders">
            {look.sliders.map((c) => (
              <span key={c} style={{ background: c }} />
            ))}
          </span>
        )}
        {look.band && <span className="sw-band" style={{ background: look.band }} />}
        {look.grip && <span className="sw-grip" style={{ background: look.grip }} />}
      </span>
      <span className="sw-nib" style={{ borderLeftColor: look.nib }} />
      <span className="sw-point" />
    </span>
  );
}

/** A pen's printed pattern, drawn small for the swatch. */
function patternCss(p: PenPattern): string {
  const [a, b = a, c = a, d = a] = p.colors;
  switch (p.kind) {
    case 'dots':
      return `radial-gradient(circle, ${a} 1px, transparent 1.5px) 0 0 / 4px 4px`;
    case 'rings':
      return `linear-gradient(90deg, transparent 40%, ${a} 40% 43%, transparent 43% 48%, ${a} 48% 51%, transparent 51%)`;
    case 'label':
      return `linear-gradient(90deg, transparent 35%, ${a} 35% 70%, transparent 70%)`;
    default:
      return `linear-gradient(90deg, transparent 30%, ${a} 30% 40%, ${b} 40% 50%, ${c} 50% 58%, ${d} 58% 66%, transparent 66%)`;
  }
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
