/** Which move an animation is for, judged by the words in its name. First match wins, so the order matters. */
const RULES = [
  ['death', /death|dying|die\b/],
  ['hit', /impact|hit|react|stagger/],
  ['guard', /block|guard/],
  ['dodge', /dodge|roll|evade/],
  ['special', /spin|360|casting|power/],
  ['heavy', /heavy|high.*attack|jump.*attack/],
  ['light3', /slash.*3|attack.*3|slash \(?3|strike.*3/],
  ['light2', /slash.*2|attack.*2|strike.*2/],
  ['light1', /slash|attack|strike/],
  ['strafeLeft', /strafe.*left|left.*strafe|walk.*left/],
  ['strafeRight', /strafe.*right|right.*strafe|walk.*right/],
  ['back', /back|backward/],
  ['run', /run|jog|sprint/],
  ['walk', /walk/],
  ['idle', /idle|stance|\btpose\b/],
];

export const SLOTS = RULES.map(([slot]) => slot);

export function slotFor(name) {
  const n = name.toLowerCase();
  return RULES.find(([, pattern]) => pattern.test(n))?.[0] ?? null;
}
