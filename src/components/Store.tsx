import { useState } from 'react';
import { BOOSTS, MAX_BOOSTS, type BoostTiming } from '../game/boosts';
import { PEN_MODELS, type PenLevel } from '../game/pens';
import { POWERS, type PowerId } from '../game/powers';
import { StoreError, boostCount, boxLimit, buyBoost, buyPen, buyPower, hasRoom, type Profile } from '../profile/economy';
import { BoostIcon } from './BoostIcon';
import { PenBox, PenLabel, PenSwatch, Rupees } from './PenBox';

interface Props {
  profile: Profile;
  onSave: (p: Profile) => void;
  onBack: () => void;
}

type Tab = 'pens' | 'boosts' | 'powers';

const TAB_NAMES: Record<Tab, string> = { pens: 'Pens', boosts: 'Super powers', powers: 'Hero powers' };

/** When each kind of super power works, for its shelf heading. */
const TIMING: Record<BoostTiming, string> = {
  mine: 'On your turn, for your shot',
  theirs: 'While they aim, against their shot',
  round: 'Any time, for the round',
};

/** The stationery shop: pens by level, one-use super powers, and hero powers for a pen you own. */
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

  const full = !hasRoom(profile);
  const limit = boxLimit(profile);

  return (
    <main className="cover shop">
      <header className="name-label">
        <h1 className="label-title">Pen store</h1>
        <p className="label-note">
          You have <Rupees amount={profile.rupees} /> · pencil box{' '}
          {Number.isFinite(limit) ? `${profile.pens.length}/${limit}` : `${profile.pens.length} pens`}
          {profile.tester && ' · test account'}
        </p>
      </header>

      <div className="tabs" role="tablist" aria-label="Store">
        {(['pens', 'boosts', 'powers'] as const).map((t) => (
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
            {TAB_NAMES[t]}
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
          <p id="store-limit" className="muted">
            {full ? 'Your pencil box is full. Lose or swap a pen to make room.' : 'Pens cost what the tag says. Tap Buy to see if you can afford one.'}
          </p>
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
                        aria-describedby={!afford || full ? 'store-limit' : undefined}
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

      {tab === 'boosts' && (
        <div className="shelves">
          <p className="muted">
            In a match, the lightning button at the bottom of the desk opens your powers. On your turn, use one for
            your shot; while the other player aims, use one against their shot. One each a shot; tap again to take
            it back. Every match gives you one use free, and each power bought here works once. You can hold up to{' '}
            {MAX_BOOSTS} of each.
          </p>
          {(['mine', 'theirs', 'round'] as const).map((timing) => (
            <section key={timing} className="shelf">
              <h2>{TIMING[timing]}</h2>
              <ul className="shelf-items powers">
                {BOOSTS.filter((b) => b.timing === timing).map((b) => {
                  const have = boostCount(profile, b.id);
                  return (
                    <li key={b.id} className="shop-item power-item boost-item" style={{ '--boost': b.color } as React.CSSProperties}>
                      <span className="boost-chip" aria-hidden>
                        <BoostIcon id={b.id} />
                      </span>
                      <span className="pen-text">
                        <span className="pen-name">{b.name}</span>
                        <span className="pen-meta">{b.tagline}</span>
                        <span className="pen-meta">You have {have}</span>
                      </span>
                      <span className="price-tag">₹{b.price}</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        onClick={() => attempt(() => buyBoost(profile, b.id), `${b.name} bought. You have ${have + 1}.`)}
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
                  aria-pressed={power === p.id}
                  onClick={() => {
                    if (profile.rupees < p.price) {
                      setPower(null);
                      setMessage({ text: `${p.name} costs ₹${p.price}. You have ₹${profile.rupees}: win a few matches first.`, ok: false });
                      return;
                    }
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
              <PenBox pens={profile.pens} selected={target} onSelect={setTarget} label="Your pens" limit={limit} />
              {target && (
                <p className="preview-line">
                  <PenSwatch model={profile.pens.find((x) => x.uid === target)!.model} power={power} />
                  <PenLabel pen={{ model: profile.pens.find((x) => x.uid === target)!.model, power }} />
                </p>
              )}
              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  target
                    ? attempt(() => buyPower(profile, power, target), `${POWERS.find((p) => p.id === power)!.name} is on your pen.`)
                    : setMessage({ text: 'Pick one of your pens above for the power.', ok: false })
                }
              >
                Buy and apply
              </button>
            </section>
          )}
        </div>
      )}

      <button type="button" className="btn btn-secondary" onClick={onBack}>
        Go back
      </button>
    </main>
  );
}
