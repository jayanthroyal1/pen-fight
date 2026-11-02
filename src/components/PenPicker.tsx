import { PEN_MODELS, penModel, type PenModelId } from '../game/pens';

interface Props {
  title: string;
  hint?: string;
  value: PenModelId;
  onChange: (id: PenModelId) => void;
  confirmLabel: string;
  onConfirm: () => void;
  onBack: () => void;
}

const POWER_STEPS = PEN_MODELS.length;

/** Choose one of the five pens; each hits with a different power. */
export function PenPicker({ title, hint, value, onChange, confirmLabel, onConfirm, onBack }: Props) {
  return (
    <main className="menu paper picker">
      <h1>{title}</h1>
      {hint && <p className="tagline">{hint}</p>}

      <form
        className="picker-form"
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm();
        }}
      >
        <fieldset className="pen-options">
          <legend className="visually-hidden">Pen</legend>
          {PEN_MODELS.map((m, i) => (
            <label key={m.id} className={`pen-option${value === m.id ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name="pen"
                value={m.id}
                checked={value === m.id}
                onChange={() => onChange(m.id)}
                className="visually-hidden"
              />
              <PenSwatch id={m.id} />
              <span className="pen-text">
                <span className="pen-name">{m.name}</span>
                <span className="pen-power">{m.powerLabel}</span>
              </span>
              <span className="power-meter" aria-hidden>
                {Array.from({ length: POWER_STEPS }, (_, s) => (
                  <span key={s} className={s <= i ? 'on' : ''} />
                ))}
              </span>
            </label>
          ))}
        </fieldset>

        <div className="picker-actions">
          <button type="submit" className="btn btn-primary">
            {confirmLabel}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onBack}>
            Back
          </button>
        </div>
      </form>
    </main>
  );
}

/** A small side view of the pen in its own colours. */
export function PenSwatch({ id }: { id: PenModelId }) {
  const { look } = penModel(id);
  const shade = (c: string) =>
    look.metal
      ? `linear-gradient(180deg, #f4f6f8 0%, ${c} 40%, #4c535c 100%)`
      : `linear-gradient(180deg, color-mix(in srgb, ${c} 60%, white) 0%, ${c} 45%, color-mix(in srgb, ${c} 65%, black) 100%)`;
  return (
    <span className="pen-swatch" aria-hidden>
      <span className="sw-plug" style={{ background: shade(look.plug) }} />
      <span className="sw-barrel" style={{ background: shade(look.barrel), opacity: look.translucent ? 0.8 : 1 }}>
        {look.translucent && <span className="sw-ink" style={{ background: look.ink }} />}
        <span className="sw-cap" style={{ background: shade(look.cap) }}>
          <span className="sw-clip" />
        </span>
        {look.grip && <span className="sw-grip" style={{ background: look.grip }} />}
      </span>
      <span className="sw-nib" style={{ borderLeftColor: look.nib }} />
      <span className="sw-point" />
    </span>
  );
}
