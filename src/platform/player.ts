/** Who's playing on this device, shared by every game. */

const NAME_KEY = 'wildplayers:name';
/** Where Doodle Rush kept the name before it was shared. */
const OLD_NAME_KEY = 'wildplayers:doodle-name';
const ID_KEY = 'wildplayers:player-id';

export function playerName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? localStorage.getItem(OLD_NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // Remembering is only a convenience.
  }
}

/** A private id for this device's player: it's what proves a score is theirs, so it's never shown. */
export function playerId(): string {
  try {
    const known = localStorage.getItem(ID_KEY);
    if (known) return known;
    const id = crypto.randomUUID();
    localStorage.setItem(ID_KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}
