import { describe, expect, it } from 'vitest';
import { inviteLink, isRoomCode } from './invite';

describe('inviteLink', () => {
  it('points at the game with the room code', () => {
    expect(inviteLink('SRTF', 'https://penfight.example/play/')).toBe('https://penfight.example/play/?room=SRTF');
  });

  it('drops anything else in the base address', () => {
    expect(inviteLink('SRTF', 'https://penfight.example/?room=OLDX&x=1#top')).toBe(
      'https://penfight.example/?room=SRTF',
    );
  });
});

describe('isRoomCode', () => {
  it('accepts the relay codes and nothing else', () => {
    expect(isRoomCode('SRTF')).toBe(true);
    expect(isRoomCode('SRT')).toBe(false);
    expect(isRoomCode('SRTO')).toBe(false);
    expect(isRoomCode('srtf')).toBe(false);
  });
});
