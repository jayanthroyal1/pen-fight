
import { useState } from 'react';
import { BOOSTS, MAX_BOOSTS, type BoostTiming } from '../game/boosts';
import { PEN_MODELS, type PenLevel } from '../game/pens';
import { POWERS, type PowerId } from '../game/powers';
import {
  StoreError,
  boostCount,
  boxLimit,
  buyBoost,
  buyPen,
  buyPower,
  hasRoom,
  type Profile,
} from '../profile/economy';
import { BoostIcon } from './BoostIcon';
import { PenBox, PenLabel, PenSwatch, Rupees } from './PenBox';

interface Props {
  profile: Profile;
  onSave: (p: Profile) => void;
  onBack: () => void;
}

type Tab = 'pens' | 'boosts' | 'powers';

const TAB_NAMES: Record<Tab, string> = {
  pens: 'Pens',
  boosts: 'Super powers',
  powers: 'Hero powers',
};

const TIMING: Record<BoostTiming, string> = {
  mine: 'On your turn, for your shot',
  theirs: 'While they aim, against their shot',
  round: 'Any time, for the round',
};

export function Store({ profile, onSave, onBack }: Props) {
  const [tab, setTab] = useState<Tab>('pens');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [power, setPower] = useState<PowerId | null>(null);
  const [target, setTarget] = useState<string | null>(null);

  const full = !hasRoom(profile);
  const limit = boxLimit(profile);

  const attempt = (fn: () => Profile, done: string) => {
    try {
      onSave(fn());
      setMessage({ text: done, ok: true });
    } catch (e) {
      setMessage({
        text: e instanceof StoreError ? e.message : 'That didn’t work. Try again.',
        ok: false,
      });
    }
  };

  // Independent layout styles — avoid conflicting card CSS classes.
  const listStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '16px',
    width: '100%',
    maxWidth: '100%',
    height: 'auto',
    minWidth: 0,
    padding: '12px',
    margin: '0',
    listStyle: 'none',
    boxSizing: 'border-box',
    position: 'static',
  };

  const cardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    alignContent: 'center',
    gap: '12px',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    minHeight: '110px',
    height: 'auto',
    padding: '16px',
    margin: '0',
    boxSizing: 'border-box',
    position: 'static',
    inset: 'auto',
    float: 'none',
    clear: 'both',
    overflow: 'visible',
  };

  const iconStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 56px',
    width: '56px',
    minWidth: '56px',
    maxWidth: '56px',
    height: '56px',
    position: 'static',
    float: 'none',
    margin: '0',
    boxSizing: 'border-box',
  };

  const descriptionStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    flex: '1 1 140px',
    minWidth: '0',
    maxWidth: '100%',
    height: 'auto',
    position: 'static',
    float: 'none',
    margin: '0',
    padding: '0',
    overflow: 'visible',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    wordBreak: 'normal',
    lineHeight: 1.4,
    boxSizing: 'border-box',
  };

  const nameStyle: React.CSSProperties = {
    display: 'block',
    position: 'static',
    width: '100%',
    height: 'auto',
    margin: '0 0 4px',
    padding: '0',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    lineHeight: 1.3,
  };

  const metaStyle: React.CSSProperties = {
    display: 'block',
    position: 'static',
    width: '100%',
    height: 'auto',
    margin: '2px 0 0',
    padding: '0',
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    lineHeight: 1.4,
  };

  const priceStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    position: 'static',
    float: 'none',
    width: 'auto',
    maxWidth: '100%',
    height: 'auto',
    margin: '0',
    padding: '8px 12px',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
  };

  const actionStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    position: 'static',
    float: 'none',
    inset: 'auto',
    width: 'auto',
    minWidth: '90px',
    maxWidth: '100%',
    height: 'auto',
    margin: '0',
    padding: '10px 16px',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
  };

  const sectionStyle: React.CSSProperties = {
    display: 'block',
    position: 'static',
    float: 'none',
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    height: 'auto',
    margin: '24px 0',
    padding: '0',
    boxSizing: 'border-box',
    overflow: 'visible',
  };

  const headingStyle: React.CSSProperties = {
    display: 'block',
    position: 'static',
    width: '100%',
    height: 'auto',
    margin: '0 0 12px',
    padding: '0',
    lineHeight: 1.4,
    whiteSpace: 'normal',
  };

  return (
    <main className="cover shop">
      <header className="name-label">
        <h1 className="label-title">Pen store</h1>
        <p className="label-note">
          You have <Rupees amount={profile.rupees} /> · pencil box{' '}
          {Number.isFinite(limit)
            ? `${profile.pens.length}/${limit}`
            : `${profile.pens.length} pens`}
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
        <p
          className={message.ok ? 'stamp-note' : 'error'}
          role={message.ok ? 'status' : 'alert'}
        >
          {message.text}
        </p>
      )}

      {/* PENS TAB */}
      {tab === 'pens' && (
        <div className="shelves">
          <p id="store-limit" className="muted">
            {full
              ? 'Your pencil box is full. Lose or swap a pen to make room.'
              : 'Pens cost what the tag says. Tap Buy to see if you can afford one.'}
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
                        onClick={() =>
                          attempt(
                            () => buyPen(profile, m.id),
                            `${m.name} is in your pencil box.`,
                          )
                        }
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

      {/* SUPER POWERS TAB */}
      {tab === 'boosts' && (
        <div
          style={{
            display: 'block',
            position: 'static',
            width: '100%',
            maxWidth: '100%',
            height: 'auto',
            minWidth: 0,
            boxSizing: 'border-box',
          }}
        >
          <p className="muted">
            In a match, the lightning button at the bottom of the desk opens your
            powers. On your turn, use one for your shot; while the other player
            aims, use one against their shot. One each a shot; tap again to take
            it back. Every match gives you one use free, and each power bought
            here works once. You can hold up to {MAX_BOOSTS} of each.
          </p>

          {(['mine', 'theirs', 'round'] as const).map((timing) => (
            <section key={timing} style={sectionStyle}>
              <h2 style={headingStyle}>{TIMING[timing]}</h2>

              <ul style={listStyle}>
                {BOOSTS.filter((b) => b.timing === timing).map((b) => {
                  const have = boostCount(profile, b.id);

                  return (
                    <li
                      key={b.id}
                      style={{
                        ...cardStyle,
                        border: '2px solid #d6c4a5',
                        borderRadius: '14px',
                        background: 'rgba(255, 250, 240, 0.96)',
                        color: '#49301f',
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          ...iconStyle,
                          borderRadius: '12px',
                          background: '#292929',
                          color: b.color,
                        }}
                      >
                        <BoostIcon id={b.id} />
                      </span>

                      <div style={descriptionStyle}>
                        <span style={nameStyle}>{b.name}</span>
                        <span style={metaStyle}>{b.tagline}</span>
                        <span style={metaStyle}>You have {have}</span>
                      </div>

                      <span
                        style={{
                          ...priceStyle,
                          color: '#b3261e',
                          background: '#fff',
                          borderRadius: '10px',
                          fontWeight: 700,
                          fontSize: '1.1em',
                        }}
                      >
                        ₹{b.price}
                      </span>

                      <button
                        type="button"
                        className="btn btn-secondary btn-small"
                        style={actionStyle}
                        onClick={() =>
                          attempt(
                            () => buyBoost(profile, b.id),
                            `${b.name} bought. You have ${have + 1}.`,
                          )
                        }
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

      {/* HERO POWERS TAB */}
      {tab === 'powers' && (
        <div
          style={{
            display: 'block',
            position: 'static',
            float: 'none',
            width: '100%',
            maxWidth: '100%',
            minWidth: 0,
            height: 'auto',
            margin: '0',
            padding: '0',
            boxSizing: 'border-box',
            overflow: 'visible',
          }}
        >
          <p className="muted">
            A power goes on one pen: new colours, its own entrance, flick and
            strike, a finishing move and a little extra hit power. If you lose
            that pen, the power goes with it.
          </p>

          <ul style={listStyle}>
            {POWERS.map((p) => (
              <li
                key={p.id}
                style={{
                  ...cardStyle,
                  border: power === p.id
                    ? '3px solid #244a96'
                    : '2px solid #d6c4a5',
                  borderRadius: '14px',
                  background: '#fffaf0',
                  color: '#49301f',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    ...iconStyle,
                    flex: '0 0 auto',
                    width: 'auto',
                    minWidth: '100px',
                    maxWidth: '140px',
                    height: 'auto',
                    minHeight: '64px',
                    padding: '10px',
                    borderRadius: '12px',
                    background: p.color,
                    color: p.accent,
                    fontWeight: 800,
                    textAlign: 'center',
                    overflowWrap: 'anywhere',
                  }}
                >
                  {p.shout.replace('!', '')}
                </span>

                <div style={descriptionStyle}>
                  <span style={nameStyle}>{p.name}</span>
                  <span style={metaStyle}>{p.tagline}</span>
                </div>

                <span
                  style={{
                    ...priceStyle,
                    color: '#b3261e',
                    background: '#fff',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '1.1em',
                  }}
                >
                  ₹{p.price}
                </span>

                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  style={actionStyle}
                  aria-pressed={power === p.id}
                  onClick={() => {
                    if (profile.rupees < p.price) {
                      setPower(null);
                      setMessage({
                        text: `${p.name} costs ₹${p.price}. You have ₹${profile.rupees}: win a few matches first.`,
                        ok: false,
                      });
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
              <h2>
                Which pen gets {POWERS.find((p) => p.id === power)!.name}?
              </h2>

              <PenBox
                pens={profile.pens}
                selected={target}
                onSelect={setTarget}
                label="Your pens"
                limit={limit}
              />

              {target && (
                <p className="preview-line">
                  <PenSwatch
                    model={profile.pens.find((x) => x.uid === target)!.model}
                    power={power}
                  />
                  <PenLabel
                    pen={{
                      model: profile.pens.find((x) => x.uid === target)!.model,
                      power,
                    }}
                  />
                </p>
              )}

              <button
                type="button"
                className="btn btn-primary"
                onClick={() =>
                  target
                    ? attempt(
                        () => buyPower(profile, power, target),
                        `${POWERS.find((p) => p.id === power)!.name} is on your pen.`,
                      )
                    : setMessage({
                        text: 'Pick one of your pens above for the power.',
                        ok: false,
                      })
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
