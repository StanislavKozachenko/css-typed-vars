import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CONFIG_KEYS } from '../config.js';
import { VALID_NAMINGS } from '../generator.js';

const schema = JSON.parse(readFileSync('schema.json', 'utf8'));
const properties = schema.definitions.config.properties;

describe('schema.json', () => {
  it('describes every config option, and nothing else', () => {
    expect(Object.keys(properties).filter((key) => key !== '$schema').sort()).toEqual([...CONFIG_KEYS].sort());
  });

  it('lists the valid naming conventions', () => {
    expect(properties.naming.enum).toEqual(VALID_NAMINGS);
  });

  it('is shipped and exported by the package', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.files).toContain('schema.json');
    expect(pkg.exports['./schema.json']).toBe('./schema.json');
  });
});
