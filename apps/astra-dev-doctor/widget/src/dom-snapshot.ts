import type {DomSnapshot, DomSnapshotNode} from './types';

const maxDepth = 5;
const maxNodes = 160;
const textLimit = 120;

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function cssPath(el: Element): string {
  const id = el.id ? `#${CSS.escape(el.id)}` : '';
  if (id) {
    return id;
  }
  const testId = el.getAttribute('data-testid');
  if (testId) {
    return `[data-testid="${CSS.escape(testId)}"]`;
  }
  const role = el.getAttribute('role');
  const tag = el.tagName.toLowerCase();
  const cls = Array.from(el.classList)
    .slice(0, 2)
    .map((c) => `.${CSS.escape(c)}`)
    .join('');
  return `${tag}${role ? `[role="${role}"]` : ''}${cls}`;
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    Number(style.opacity) !== 0
  );
}

function attrs(el: Element): Record<string, string> {
  const names = [
    'aria-expanded',
    'aria-invalid',
    'aria-required',
    'aria-describedby',
    'aria-controls',
    'type',
  ];
  return Object.fromEntries(
    names.map((name) => [name, el.getAttribute(name) ?? '']).filter(([, value]) => value),
  );
}

function styles(el: Element): Record<string, string> {
  const s = window.getComputedStyle(el);
  return {
    display: s.display,
    position: s.position,
    overflow: `${s.overflowX}/${s.overflowY}`,
    zIndex: s.zIndex,
    width: s.width,
    minWidth: s.minWidth,
    maxWidth: s.maxWidth,
    whiteSpace: s.whiteSpace,
  };
}

function nodeFromElement(
  el: Element,
  depth: number,
  counter: {count: number},
): DomSnapshotNode | null {
  if (counter.count >= maxNodes || !isVisible(el)) {
    return null;
  }

  counter.count += 1;
  const rect = el.getBoundingClientRect();
  const node: DomSnapshotNode = {
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role') ?? '',
    name: el.getAttribute('aria-label') ?? el.getAttribute('name') ?? '',
    text: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, textLimit),
    selector: cssPath(el),
    rect: {
      x: round(rect.x),
      y: round(rect.y),
      width: round(rect.width),
      height: round(rect.height),
      top: round(rect.top),
      right: round(rect.right),
      bottom: round(rect.bottom),
      left: round(rect.left),
    },
    attrs: attrs(el),
    styles: styles(el),
    children: [],
  };

  if (depth < maxDepth) {
    for (const child of Array.from(el.children)) {
      if (child.id === 'ids-doctor-host') {
        continue;
      }
      const childNode = nodeFromElement(child, depth + 1, counter);
      if (childNode) {
        node.children.push(childNode);
      }
      if (counter.count >= maxNodes) {
        break;
      }
    }
  }

  return node;
}

function importantRoots(): Element[] {
  const selectors = [
    'main',
    'form',
    '[role="dialog"]',
    '[role="listbox"]',
    '[role="menu"]',
    '[role="tooltip"]',
    '[aria-invalid="true"]',
    '[data-testid]',
  ];
  const roots = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
  const fallback = document.querySelector('main') ?? document.body;
  return Array.from(new Set([fallback, ...roots])).filter((el) => el.id !== 'ids-doctor-host');
}

export function captureDomSnapshot(): DomSnapshot {
  const counter = {count: 0};
  const tree = importantRoots()
    .map((el) => nodeFromElement(el, 0, counter))
    .filter((node): node is DomSnapshotNode => Boolean(node));

  const active =
    document.activeElement && document.activeElement !== document.body
      ? nodeFromElement(document.activeElement, maxDepth, {count: 0})
      : null;

  const highlightedSelectors = [
    '[role="listbox"]',
    '[role="menu"]',
    '[role="dialog"]',
    '[aria-invalid="true"]',
    'input',
    'button',
    '[role="combobox"]',
  ];
  const highlighted = highlightedSelectors
    .flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    .filter((el) => el.id !== 'ids-doctor-host')
    .slice(0, 40)
    .map((el) => nodeFromElement(el, maxDepth, {count: 0}))
    .filter((node): node is DomSnapshotNode => Boolean(node));

  return {
    capturedAt: new Date().toISOString(),
    url: window.location.href,
    title: document.title,
    viewport: {width: window.innerWidth, height: window.innerHeight},
    document: {
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    },
    focusedElement: active,
    highlighted,
    tree,
  };
}
