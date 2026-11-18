// Review item 9: components use design tokens only, and the token pairs we
// rely on for text meet WCAG AA contrast in both themes.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// Read the file directly: Vitest's css:false setting empties CSS imports, even ?raw ones.
// (import.meta.url is not a file: URL under jsdom, so resolve from the project root.)
const tokensCss = readFileSync(path.resolve(process.cwd(), 'src/design/tokens.css'), 'utf8')

const sources = import.meta.glob(['../**/*.{js,jsx}', '!../**/*.test.{js,jsx}', '!../test/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
})

const RAW_COLOUR = /\b(?:bg|text|border|ring|fill|stroke|shadow|from|via|to|outline|decoration)-(?:black|white)\b|#[0-9a-fA-F]{3,8}\b|rgba?\(/

describe('no raw colours outside tokens.css', () => {
  it('scans the app sources', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(15)
  })

  it.each(Object.entries(sources))('%s uses tokens only', (_file, code) => {
    const offending = code.split('\n').filter((line) => RAW_COLOUR.test(line))
    expect(offending).toEqual([])
  })
})

// --- contrast ---------------------------------------------------------------

function themeBlock(selector) {
  const start = tokensCss.indexOf(`${selector} {`)
  return tokensCss.slice(start, tokensCss.indexOf('}', start))
}

function token(block, name) {
  const m = block.match(new RegExp(`--ht-${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!m) throw new Error(`token --ht-${name} not found as a hex value`)
  return m[1]
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

describe('WCAG AA contrast for solid red buttons (SOS, Call 112/108, danger)', () => {
  it.each([
    ['dark', "[data-theme='dark']"],
    ['light', "[data-theme='light']"],
  ])('%s theme: critical-fg on critical-solid is at least 4.5:1', (_name, selector) => {
    const block = themeBlock(selector)
    expect(contrast(token(block, 'critical-fg'), token(block, 'critical-solid'))).toBeGreaterThanOrEqual(4.5)
  })

  it('the old pairing (white on #ef4444) really was below AA', () => {
    expect(contrast('#ffffff', '#ef4444')).toBeLessThan(4.5)
  })
})
