// Copyright 2026 MB AFKzona Group
// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Minimal DOM building for the offline app. Text always goes in as text
 * nodes; attributes are checked against an allow-list. There is no path
 * from data to HTML parsing.
 */

import { ATTRIBUTION, DIRECTIVE, PROJECT_URL } from '../core/legal.js';
import type { Block, Cell, Inline } from '../report/document.js';

type Child = Node | string | null | undefined | false;
type Attrs = Readonly<Record<string, string | boolean | undefined>>;

const ALLOWED_ATTRIBUTES = new Set([
  'class',
  'id',
  'type',
  'name',
  'value',
  'for',
  'href',
  'download',
  'target',
  'rel',
  'role',
  'accept',
  'placeholder',
  'inputmode',
  'autocomplete',
  'min',
  'max',
  'step',
  'maxlength',
  'tabindex',
  'scope',
  'lang',
  'hidden',
  'disabled',
  'checked',
  'spellcheck',
  'title',
]);

const EUR_LEX_ARTICLES = 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023L0970#';
const FIXED_LINKS: ReadonlySet<string> = new Set([DIRECTIVE.url, ATTRIBUTION.url, PROJECT_URL]);

/**
 * Links may only point to the official text, the attribution and project
 * pages, or a local blob: download. No other host can be reached, so no link
 * can carry data off the machine.
 */
export function isAllowedHref(value: string): boolean {
  if (FIXED_LINKS.has(value)) return true;
  if (value.startsWith(EUR_LEX_ARTICLES)) return /^(art|rct)_[0-9]{1,2}$/.test(value.slice(EUR_LEX_ARTICLES.length));
  return value.startsWith('blob:');
}

function checkAttribute(name: string, value: string): void {
  if (!(ALLOWED_ATTRIBUTES.has(name) || name.startsWith('aria-') || name.startsWith('data-'))) {
    throw new Error(`attribute not allowed: ${name}`);
  }
  if (name === 'href' && !isAllowedHref(value)) throw new Error('link target not allowed');
}

/** Creates an element with checked attributes and text or node children. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    const text = value === true ? '' : value;
    checkAttribute(name, text);
    el.setAttribute(name, text);
  }
  append(el, ...children);
  return el;
}

/** Appends text (as text nodes) and nodes. */
export function append(parent: Node, ...children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

/** Removes all children. */
export function clear(el: Element): void {
  while (el.firstChild !== null) el.removeChild(el.firstChild);
}

/** Small inline SVG mark (a level line over a keel). */
export function logo(): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.setAttribute('width', '28');
  svg.setAttribute('height', '28');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'logo');
  const hull = document.createElementNS(ns, 'path');
  hull.setAttribute('d', 'M4 14h24l-4 9H8z');
  hull.setAttribute('class', 'logo-hull');
  const line = document.createElementNS(ns, 'path');
  line.setAttribute('d', 'M2 10h28');
  line.setAttribute('class', 'logo-line');
  const keel = document.createElementNS(ns, 'path');
  keel.setAttribute('d', 'M16 23v5');
  keel.setAttribute('class', 'logo-line');
  svg.append(line, hull, keel);
  return svg;
}

function cellText(c: Cell): string {
  return typeof c === 'string' ? c : c.data;
}

function inline(content: readonly Inline[]): Child[] {
  return content.map((c) =>
    typeof c === 'string' || 'data' in c ? cellText(c) : h('a', { href: c.url, target: '_blank', rel: 'noopener noreferrer' }, c.text),
  );
}

/** Renders report document blocks into DOM nodes. Heading levels are shifted by `shift`. */
export function renderBlocks(blocks: readonly Block[], shift: 0 | 1 = 1): Node[] {
  const nodes: Node[] = [];
  for (const b of blocks) {
    switch (b.kind) {
      case 'heading': {
        const level = Math.min(b.level + shift, 4);
        nodes.push(h(level === 1 ? 'h1' : level === 2 ? 'h2' : level === 3 ? 'h3' : 'h4', {}, ...inline(b.text)));
        break;
      }
      case 'paragraph':
        nodes.push(h('p', {}, ...inline(b.content)));
        break;
      case 'note':
        nodes.push(h('p', { class: 'note' }, ...inline(b.content)));
        break;
      case 'footer':
        nodes.push(h('p', { class: 'muted small' }, ...inline(b.content)));
        break;
      case 'list':
        nodes.push(h('ul', {}, ...b.items.map((i) => h('li', {}, i))));
        break;
      case 'table':
        nodes.push(
          h(
            'div',
            { class: 'scroll', tabindex: '0', role: 'region', 'aria-label': 'Table' },
            h(
              'table',
              {},
              h('thead', {}, h('tr', {}, ...b.head.map((x) => h('th', { scope: 'col' }, x)))),
              h('tbody', {}, ...b.rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, cellText(c)))))),
            ),
          ),
        );
        break;
    }
  }
  return nodes;
}

/** Offers text as a file download through a temporary blob: URL. */
export function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = h('a', { href: url, download: filename, hidden: true });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
