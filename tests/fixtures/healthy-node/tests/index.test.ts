import { describe, it, expect } from 'vitest';
import { add, greet } from '../src/index.js';

describe('math', () => {
  it('adds numbers correctly', () => {
    expect(add(1, 2)).toBe(3);
  });
  it('greets user', () => {
    expect(greet('World')).toBe('Hello, World!');
  });
});
