import { useState } from 'react';
import { GameView } from './components/GameView';
import { Menu } from './components/Menu';
import { OnlineLobby } from './components/OnlineLobby';
import { PenPicker } from './components/PenPicker';
import { PEN_MODELS, isPenModelId, penModel, type PenModelId } from './game/pens';
import type { PlayerId } from './game/types';
import type { OnlineClient } from './net/client';
import { takeInviteCode } from './net/invite';

type Mode = 'local' | 'ai' | 'online';
type Models = [PenModelId, PenModelId];

type Screen =
  | { kind: 'menu' }
  /** Choosing pens; local play asks each player in turn. `invite` is a room to join after. */
  | { kind: 'pick'; mode: Mode; chosen: PenModelId[]; invite?: string }
  | { kind: 'lobby'; model: PenModelId; joinCode?: string }
  | { kind: 'game'; mode: 'local' | 'ai'; models: Models; id: number }
  | { kind: 'online'; client: OnlineClient; me: PlayerId; models: Models };

const LAST_PEN_KEY = 'penfight:pen';

function lastPen(): PenModelId {
  try {
    const v = localStorage.getItem(LAST_PEN_KEY);
    return isPenModelId(v) ? v : 'cello';
  } catch {
    return 'cello';
  }
}

function rememberPen(id: PenModelId): void {
  try {
    localStorage.setItem(LAST_PEN_KEY, id);
  } catch {
    // Only a convenience; ignore blocked storage.
  }
}

/** Read once at load: React may run state initialisers twice, and this clears the address bar. */
const openingInvite = takeInviteCode();

const randomPen = (): PenModelId => PEN_MODELS[Math.floor(Math.random() * PEN_MODELS.length)].id;

export function App() {
  // Opened from an invite link: choose a pen, then straight into the friend's room.
  const [screen, setScreen] = useState<Screen>(() =>
    openingInvite ? { kind: 'pick', mode: 'online', chosen: [], invite: openingInvite } : { kind: 'menu' },
  );
  const [pen, setPen] = useState<PenModelId>(lastPen);
  const toMenu = () => setScreen({ kind: 'menu' });
  const pick = (mode: Mode) => setScreen({ kind: 'pick', mode, chosen: [] });

  const confirmPick = (s: Extract<Screen, { kind: 'pick' }>) => {
    rememberPen(pen);
    const chosen = [...s.chosen, pen];
    if (s.mode === 'online') setScreen({ kind: 'lobby', model: pen, joinCode: s.invite });
    else if (s.mode === 'ai') setScreen({ kind: 'game', mode: 'ai', models: [pen, randomPen()], id: Date.now() });
    else if (chosen.length < 2) setScreen({ kind: 'pick', mode: 'local', chosen });
    else setScreen({ kind: 'game', mode: 'local', models: chosen as Models, id: Date.now() });
  };

  return (
    <div className="app">
      {screen.kind === 'menu' && (
        <Menu onAi={() => pick('ai')} onLocal={() => pick('local')} onOnline={() => pick('online')} />
      )}
      {screen.kind === 'pick' && (
        <PenPicker
          key={screen.chosen.length}
          title={
            screen.mode === 'local'
              ? `Player ${screen.chosen.length + 1}, choose your pen`
              : 'Choose your pen'
          }
          hint={
            screen.invite
              ? `You're invited to a pen fight in room ${screen.invite}. Pick the pen you'll fight with.`
              : screen.mode === 'local' && screen.chosen.length === 1
                ? `Player 1 picked ${penModel(screen.chosen[0]).name}.`
                : 'Stronger pens hit harder and are harder to knock off.'
          }
          value={pen}
          onChange={setPen}
          confirmLabel={
            screen.invite
              ? 'Join the fight'
              : screen.mode === 'local' && screen.chosen.length === 0
                ? 'Next: Player 2'
                : 'Use this pen'
          }
          onConfirm={() => confirmPick(screen)}
          onBack={() =>
            screen.chosen.length > 0 ? setScreen({ ...screen, chosen: screen.chosen.slice(0, -1) }) : toMenu()
          }
        />
      )}
      {screen.kind === 'lobby' && (
        <OnlineLobby
          model={screen.model}
          joinCode={screen.joinCode}
          onBack={toMenu}
          onStart={(client, me, models) => setScreen({ kind: 'online', client, me, models })}
        />
      )}
      {screen.kind === 'game' && (
        <GameView key={screen.id} mode={screen.mode} models={screen.models} onExit={toMenu} />
      )}
      {screen.kind === 'online' && (
        <GameView
          mode="online"
          models={screen.models}
          online={{ client: screen.client, me: screen.me }}
          onExit={() => {
            screen.client.close();
            toMenu();
          }}
        />
      )}
    </div>
  );
}
