import { describe, expect, it } from 'vitest';
import { decodeHtmlEntities } from '../decodeEntities';

describe('decodeHtmlEntities', () => {
  it('decodes numeric decimal character references in sourced names', () => {
    expect(decodeHtmlEntities('Cura&#231;ao')).toBe('Curaçao');
    expect(decodeHtmlEntities('C&#244;te d\u2019Ivoire')).toBe('Côte d\u2019Ivoire');
    expect(decodeHtmlEntities('T&#252;rkiye')).toBe('Türkiye');
    expect(decodeHtmlEntities('R&#233;union')).toBe('Réunion');
    expect(decodeHtmlEntities('&#197;land Islands')).toBe('Åland Islands');
  });

  it('decodes hexadecimal character references and common named entities', () => {
    expect(decodeHtmlEntities('Cura&#xE7;ao')).toBe('Curaçao');
    expect(decodeHtmlEntities('A &amp; B')).toBe('A & B');
    expect(decodeHtmlEntities('a &lt; b &gt; c')).toBe('a < b > c');
  });

  it('leaves plain names and undefined untouched', () => {
    expect(decodeHtmlEntities('France')).toBe('France');
    expect(decodeHtmlEntities(undefined)).toBeUndefined();
  });

  it('leaves unknown or control references untouched rather than mangling them', () => {
    expect(decodeHtmlEntities('A&#1;B')).toBe('A&#1;B');
    expect(decodeHtmlEntities('A&notarealentity;B')).toBe('A&notarealentity;B');
  });
});
