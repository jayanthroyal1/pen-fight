import { useEffect, useState } from 'react';
import { GameView, type MatchSetup } from './components/GameView';
import { Home } from './components/Home';
import { OnlineLobby } from './components/OnlineLobby';
import { OpponentSelect } from './components/OpponentSelect';
import { PenSelect } from './components/PenSelect';
import { Players } from './components/Players';
import { RoomSelect } from './components/RoomSelect';
import { Store } from './components/Store';
import type { Difficulty } from './game/ai';
import { PEN_MODELS } from './game/pens';
import { PRACTICE_ROOM, room as roomById, type Room } from './game/rooms';
import { other } from './game/rules';
import type { Loadout, PlayerId } from './game/types';
import type { OnlineClient } from './net/client';
import { takeInvite, type Invite } from './net/invite';
import type { Seat } from './net/protocol';
import { applyLoss, applyWin, entryProblem, ownPen, type OwnedPen, type PrizeChoice, type Profile } from './profile/economy';
import { useProfiles } from './profile/useProfiles';

type Screen =
  | { kind: 'home' }
  | { kind: 'players' }
  | { kind: 'store' }
  | { kind: 'opponent' }
  | { kind: 'rooms'; mode: 'online' | 'local'; opponentId?: string }
  /** Choosing pens: practice, online (one player), or same phone (each player in turn). */
  | { kind: 'pick'; mode: 'ai' | 'online' | 'local'; room: Room | null; opponentId?: string; first?: OwnedPen; joinCode?: string }
  | { kind: 'lobby'; room: Room; pen: OwnedPen; joinCode?: string }
  | { kind: 'game'; setup: MatchSetup; online?: { client: OnlineClient; me: PlayerId }; who: [string | null, string | null]; pens: [OwnedPen | null, OwnedPen | null] };

/** Read once at load: React may run state initialisers twice, and this clears the address bar. */
const openingInvite = takeInvite();

const loadout = (pen: OwnedPen): Loadout => ({ model: pen.model, power: pen.power });

/** The computer brings a random pen from the first three levels. */
const computerPen = (): Loadout => {
  const pool = PEN_MODELS.filter((m) => m.level <= 3);
  return { model: pool[Math.floor(Math.random() * pool.length)].id, power: null };
};

export function App() {
  const profiles = useProfiles();
  const [screen, setScreen] = useState<Screen>({ kind: 'home' });
  const [invite, setInvite] = useState<Invite | null>(openingInvite);
  const me = profiles.active;
  const home = () => setScreen({ kind: 'home' });
  const byId = (id: string | undefined | null) => profiles.profiles.find((p) => p.id === id) ?? null;

  // Opened from an invite link: once there's a player, choose a pen and join the friend's room.
  useEffect(() => {
    if (!invite || !me) return;
    setInvite(null);
    const room = roomById(invite.room);
    setScreen(entryProblem(me, room) ? { kind: 'rooms', mode: 'online' } : { kind: 'pick', mode: 'online', room, joinCode: invite.code });
  }, [invite, me]);

  if (!profiles.ready) return <div className="app" />;

  if (!me || screen.kind === 'players') {
    return (
      <div className="app">
        <Players
          profiles={profiles.profiles}
          activeId={me?.id ?? null}
          firstRun={!me}
          onCreate={async (name) => {
            const p = await profiles.create(name);
            if (!me) await profiles.setActive(p.id);
            home();
          }}
          onChoose={async (id) => {
            await profiles.setActive(id);
            home();
          }}
          onBack={home}
        />
      </div>
    );
  }

  /** Settles a staked match on this device's players. */
  const settle = (s: Extract<Screen, { kind: 'game' }>, winner: PlayerId, choice: PrizeChoice | null) => {
    const { setup, who, pens } = s;
    const bet = setup.room.bet;
    const loser = other(winner);
    const returned = choice?.kind === 'return';
    const winnerProfile = byId(who[winner]);
    const loserProfile = byId(who[loser]);
    // The prize: the loser's actual pen, or for an online opponent, a new pen just like it.
    const prize: OwnedPen = pens[loser] ?? ownPen(setup.loadouts[loser].model, Math.random, setup.loadouts[loser].power);
    if (winnerProfile) void profiles.save(applyWin(winnerProfile, bet, prize, choice));
    if (loserProfile && pens[loser]) void profiles.save(applyLoss(loserProfile, bet, pens[loser]!.uid, returned));
  };

  const startGame = (setup: MatchSetup, who: [string | null, string | null], pens: [OwnedPen | null, OwnedPen | null], online?: { client: OnlineClient; me: PlayerId }) =>
    setScreen({ kind: 'game', setup, who, pens, online });

  const content = (() => {
    switch (screen.kind) {
      case 'home':
        return (
          <Home
            profile={me}
            notices={profiles.notices}
            onDismissNotices={profiles.dismissNotices}
            onOnline={() => setScreen({ kind: 'rooms', mode: 'online' })}
            onLocal={() => setScreen({ kind: 'opponent' })}
            onPractice={() => setScreen({ kind: 'pick', mode: 'ai', room: null })}
            onStore={() => setScreen({ kind: 'store' })}
            onPlayers={() => setScreen({ kind: 'players' })}
          />
        );
      case 'store':
        return <Store profile={me} onSave={(p) => void profiles.save(p)} onBack={home} />;
      case 'opponent':
        return (
          <OpponentSelect
            me={me}
            others={profiles.profiles.filter((p) => p.id !== me.id)}
            onChoose={(id) => setScreen({ kind: 'rooms', mode: 'local', opponentId: id })}
            onCreate={async (name) => {
              const p = await profiles.create(name);
              setScreen({ kind: 'rooms', mode: 'local', opponentId: p.id });
            }}
            onBack={home}
          />
        );
      case 'rooms': {
        const opponent = byId(screen.opponentId);
        return (
          <RoomSelect
            title={screen.mode === 'online' ? 'Pick a bet' : `${me.name} vs ${opponent?.name ?? '?'}`}
            players={opponent ? [me, opponent] : [me]}
            onChoose={(room) => setScreen({ kind: 'pick', mode: screen.mode, room, opponentId: screen.opponentId })}
            onBack={home}
          />
        );
      }
      case 'pick': {
        const opponent = byId(screen.opponentId);
        const second = screen.mode === 'local' && screen.first;
        const chooser: Profile = second && opponent ? opponent : me;
        return (
          <PenSelect
            key={chooser.id}
            title={screen.mode === 'local' ? `${chooser.name}, pick your pen` : 'Pick your pen'}
            hint={
              screen.joinCode
                ? `You're invited to a ₹${screen.room?.bet} pen fight in room ${screen.joinCode}.`
                : screen.room
                  ? `${screen.room.name} · ₹${screen.room.bet} bet`
                  : 'Practice: nothing to win or lose.'
            }
            profile={chooser}
            room={screen.room}
            askDifficulty={screen.mode === 'ai'}
            confirmLabel={
              screen.joinCode ? 'Join the fight' : screen.mode === 'local' && !second ? `Next: ${opponent?.name ?? 'friend'}` : 'Fight!'
            }
            onConfirm={(pen: OwnedPen, difficulty: Difficulty) => {
              if (screen.mode === 'ai') {
                startGame(
                  {
                    mode: 'ai',
                    room: PRACTICE_ROOM,
                    staked: false,
                    names: [me.name, 'Computer'],
                    loadouts: [loadout(pen), computerPen()],
                    boxes: [me.pens, null],
                    difficulty,
                  },
                  [me.id, null],
                  [pen, null],
                );
              } else if (screen.mode === 'online' && screen.room) {
                setScreen({ kind: 'lobby', room: screen.room, pen, joinCode: screen.joinCode });
              } else if (screen.mode === 'local' && screen.room && opponent) {
                if (!screen.first) {
                  setScreen({ ...screen, first: pen });
                  return;
                }
                startGame(
                  {
                    mode: 'local',
                    room: screen.room,
                    staked: true,
                    names: [me.name, opponent.name],
                    loadouts: [loadout(screen.first), loadout(pen)],
                    boxes: [me.pens, opponent.pens],
                    difficulty,
                  },
                  [me.id, opponent.id],
                  [screen.first, pen],
                );
              }
            }}
            onBack={() => (second ? setScreen({ ...screen, first: undefined }) : home())}
          />
        );
      }
      case 'lobby': {
        const seat: Seat = { name: me.name, loadout: loadout(screen.pen) };
        return (
          <OnlineLobby
            room={screen.room}
            seat={seat}
            joinCode={screen.joinCode}
            onBack={home}
            onStart={(client, you, players) =>
              startGame(
                {
                  mode: 'online',
                  room: screen.room,
                  staked: true,
                  names: [players[0].name, players[1].name],
                  loadouts: [players[0].loadout, players[1].loadout],
                  boxes: you === 0 ? [me.pens, null] : [null, me.pens],
                  difficulty: 'medium',
                },
                you === 0 ? [me.id, null] : [null, me.id],
                you === 0 ? [screen.pen, null] : [null, screen.pen],
                { client, me: you },
              )
            }
          />
        );
      }
      case 'game': {
        const s = screen;
        return (
          <GameView
            key={`${s.setup.mode}-${s.setup.names.join('-')}`}
            setup={s.setup}
            online={s.online}
            onSettle={(winner, choice) => settle(s, winner, choice)}
            onExit={() => {
              s.online?.client.close();
              home();
            }}
          />
        );
      }
      default:
        return null;
    }
  })();

  return <div className={`app${screen.kind === 'game' ? ' is-playing' : ''}`}>{content}</div>;
}
