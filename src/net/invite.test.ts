import { describe, expect, it } from 'vitest';
import { inviteLink, isRoomCode } from './invite';

describe('inviteLink', () => {
  it('points at the game with the room code and bet room', () => {
    expect(inviteLink({ code: 'SRTF', room: 'cbse' }, 'https://penfight.example/play/')).toBe(
      'https://penfight.example/play/?room=SRTF&bet=cbse',
    );
  });

  it('drops anything else in the base address', () => {
    expect(inviteLink({ code: 'SRTF', room: 'public' }, 'https://penfight.example/?room=OLDX&x=1#top')).toBe(
      'https://penfight.example/?room=SRTF&bet=public',
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
