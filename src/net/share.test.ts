import { describe, expect, it } from 'vitest';
import { readInvite, shareTargets } from './share';

describe('shareTargets', () => {
  const targets = shareTargets('Pen fight me for ₹25!', 'https://pen.example/?room=SRTF&bet=public');

  it('offers the common apps, each opening with the invite written', () => {
    expect(targets.map((t) => t.label)).toEqual(['WhatsApp', 'Telegram', 'SMS', 'Email', 'Facebook']);
    const wa = targets.find((t) => t.id === 'whatsapp')!;
    expect(decodeURIComponent(wa.href)).toContain('Pen fight me for ₹25! https://pen.example/?room=SRTF&bet=public');
    expect(targets.find((t) => t.id === 'sms')!.href.startsWith('sms:?&body=')).toBe(true);
  });
});

describe('readInvite', () => {
  it('reads a typed code in any case or spacing', () => {
    expect(readInvite(' srtf ')).toEqual({ code: 'SRTF', room: null });
    expect(readInvite('SR TF')).toEqual({ code: 'SRTF', room: null });
  });

  it('reads a pasted invite link, or a whole shared message, with its bet room', () => {
    expect(readInvite('https://pen.example/?room=SRTF&bet=cbse')).toEqual({ code: 'SRTF', room: 'cbse' });
    expect(readInvite('Pen fight me for ₹25! https://pen.example/?room=srtf')).toEqual({ code: 'SRTF', room: null });
    expect(readInvite('pen.example/?room=SRTF&bet=public')).toEqual({ code: 'SRTF', room: 'public' });
  });

  it('turns down anything that is not a room code', () => {
    expect(readInvite('SRT')).toBeNull();
    expect(readInvite('SRTO')).toBeNull();
  });
});
