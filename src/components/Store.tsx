import { useState } from 'react';
import { PEN_MODELS, type PenLevel } from '../game/pens';
import { POWERS, type PowerId } from '../game/powers';
import { MAX_PENS, StoreError, buyPen, buyPower, type Profile } from '../profile/economy';
import { PenBox, PenLabel, PenSwatch, Rupees } from './PenBox';

interface Props {
  profile: Profile;
  onSave: (p: Profile) => void;
  onBack: () => void;
}

type Tab = 'pens' | 'powers';

/** The stationery shop: pens by level, and hero powers for a pen you own. */
export function Store({ profile, onSave, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('pens');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [power, setPower] = useState<PowerId | null>(null);
  const [target, setTarget] = useState<string | null>(null);

  const attempt = (fn: () => Profile, done: string) => {
    try {
      onSave(fn());
      setMessage({ text: done, ok: true });
    } catch (e) {
      setMessage({ text: e instanceof StoreError ? e.message : 'That didn’t work. Try again.', ok: false });
    }
  };

  const full = profile.pens.length >= MAX_PENS;

  return (
    <main className="cover shop">
      <header className="name-label">
        <h1 className="label-title">Pen store</h1>
        <p className="label-note">
          You have <Rupees amount={profile.rupees} /> · pencil box {profile.pens.length}/{MAX_PENS}
        </p>
      </header>

      <div className="tabs" role="tablist" aria-label="Store">
        {(['pens', 'powers'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`tab${tab === t ? ' is-active' : ''}`}
            onClick={() => {
              setTab(t);
              setMessage(null);
            }}
          >
            {t === 'pens' ? 'Pens' : 'Hero powers'}
          </button>
        ))}
      </div>

      {message && (
        <p className={message.ok ? 'stamp-note' : 'error'} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}

      {tab === 'pens' && (
        <div className="shelves">
          {full && <p className="muted">Your pencil box is full. Win or lose a pen to make room.</p>}
          {([1, 2, 3, 4, 5] as PenLevel[]).map((level) => (
            <section key={level} className="shelf">
              <h2>Level {level}</h2>
              <ul className="shelf-items">
                {PEN_MODELS.filter((m) => m.level === level).map((m) => {
                  const afford = profile.rupees >= m.price;
                  return (
                    <li key={m.id} className="shop-item">
                      <PenSwatch model={m.id} />
                      <PenLabel pen={{ model: m.id, power: null }} />
                      <span className="price-tag">₹{m.price}</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        disabled={!afford || full}
                        onClick={() => attempt(() => buyPen(profile, m.id), `${m.name} is in your pencil box.`)}
                      >
                        Buy
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {tab === 'powers' && (
        <div className="shelves">
          <p className="muted">
            A power goes on one pen: new colours, its own entrance, flick and strike, a finishing move and a
            little extra hit power. If you lose that pen, the power goes with it.
          </p>
          <ul className="shelf-items powers">
            {POWERS.map((p) => (
              <li key={p.id} className={`shop-item power-item${power === p.id ? ' is-selected' : ''}`}>
                <span className="power-chip" style={{ background: p.color, color: p.accent }} aria-hidden>
                  {p.shout.replace('!', '')}
                </span>
                <span className="pen-text">
                  <span className="pen-name">{p.name}</span>
                  <span className="pen-meta">{p.tagline}</span>
                </span>
                <span className="price-tag">₹{p.price}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  disabled={profile.rupees < p.price}
                  aria-pressed={power === p.id}
                  onClick={() => {
                    setPower(p.id);
                    setTarget(null);
                    setMessage(null);
                  }}
                >
                  Choose
                </button>
              </li>
            ))}
          </ul>

          {power && (
            <section className="slip">
              <h2>Which pen gets {POWERS.find((p) => p.id === power)!.name}?</h2>
              <PenBox pens={profile.pens} selected={target} onSelect={setTarget} label="Your pens" />
              {target && (
                <p className="preview-line">
                  <PenSwatch model={profile.pens.find((x) => x.uid === target)!.model} power={power} />
                  <PenLabel pen={{ model: profile.pens.find((x) => x.uid === target)!.model, power }} />
                </p>
              )}
              <button
                type="button"
                className="btn btn-primary"
                disabled={!target}
                onClick={() =>
                  target &&
                  attempt(() => buyPower(profile, power, target), `${POWERS.find((p) => p.id === power)!.name} is on your pen.`)
                }
              >
                Buy and apply
              </button>
            </section>
          )}
        </div>
      )}

      <button type="button" className="btn btn-secondary" onClick={onBack}>
        Back
      </button>
    </main>
  );
}
