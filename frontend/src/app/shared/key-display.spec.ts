import { describe, expect, it } from 'vitest';
import { compareRoomCodes } from './key-display';

describe('key display ordering', () => {
  it('orders room codes by block and numeric value', () => {
    const values = ['B02', 'A10', 'A02', 'B01', 'A01'];
    expect([...values].sort(compareRoomCodes)).toEqual([
      'A01',
      'A02',
      'A10',
      'B01',
      'B02',
    ]);
  });
});
