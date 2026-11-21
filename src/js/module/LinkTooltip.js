// LinkTooltip.js - Hover tooltip for links inside the editor
// Displays a small action bar with: visit link, edit link, unlink
import { createElement, on, portalOf, svgIcon } from '../core/dom.js';
import { BaseMediaTooltip } from './BaseMediaTooltip.js';
import { writeClipboard } from '../core/clipboard.js';
import * as Style from '../editing/Style.js';
import { PATHS } from '../core/icon-paths.js';

const ICONS = {
  open:   svgIcon(`<path d="M18 13v6l-2 2H5l-2-2V8l2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>`),
  edit:   svgIcon(PATHS.edit),
  unlink: svgIcon(`<path d="M18.84 12.25l1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71"/><path d="M5.17 11.75l-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71"/><line x1="8" y1="2" x2="8" y2="5"/><line x1="2" y1="8" x2="5" y2="8"/><line x1="16" y1="19" x2="16" y2="22"/><line x1="19" y1="16" x2="22" y2="16"/>`),
  copy:   svgIcon(PATHS.copy),
};

export class LinkTooltip extends BaseMediaTooltip {
  /** @param {import('../Context.js').Context} context */
  constructor(context) {
    // Below the link, aligned with its start.
    super(context, 120, 200, { above: false, center: false, w: 260, h: 34 });
    this._keepHideTimer = true;
  }

  initialize() {
    this._el = this._buildTooltip();
    portalOf(this.context).appendChild(this._el);

    const editable = this.context.layoutInfo.editable;

    this._disposers.push(
      // Detect when pointer enters a link
      on(editable, 'mouseover', (e) => {
        const anchor = /** @type {Element} */ (e.target)?.closest('a[href]');
        if (anchor && editable.contains(anchor)) {
          this._scheduleShow(anchor);
        }
      }),
      // Detect when pointer leaves the editable area entirely
      on(editable, 'mouseout', (e) => {
        const to = /** @type {Node|null} */ (/** @type {MouseEvent} */ (e).relatedTarget);
        if (!to || (!editable.contains(to) && !this._el.contains(to))) {
          this._scheduleHide();
        }
      }),
      // Hide when the page scrolls or resizes — the tooltip position becomes stale
      on(globalThis, 'scroll', () => this._hide(), { passive: true }),
      on(globalThis, 'resize', () => this._hide(), { passive: true }),
    );

    return this;
  }

  // ---------------------------------------------------------------------------
  // Build
  // ---------------------------------------------------------------------------

  _buildTooltip() {
    const L = this.context.locale.tooltips.link;
    const el = createElement('div', { class: 'an-link-tooltip', role: 'toolbar', 'aria-label': L.ariaLabel });
    el.style.display = 'none';

    // URL preview text (truncated)
    this._urlLabel = createElement('span', { class: 'an-link-tooltip-url' });
    el.appendChild(this._urlLabel);

    // Separator
    el.appendChild(createElement('div', { class: 'an-link-tooltip-sep' }));

    // Action buttons
    this._openBtn   = this._makeBtn(ICONS.open,   L.openLink,   () => this._openLink());
    this._copyBtn   = this._makeBtn(ICONS.copy,   L.copyUrl,    () => this._copyLink());
    this._editBtn   = this._makeBtn(ICONS.edit,   L.editLink,   () => this._editLink());
    this._unlinkBtn = this._makeBtn(ICONS.unlink, L.removeLink, () => this._unlink());

    el.appendChild(this._openBtn);
    el.appendChild(this._copyBtn);
    el.appendChild(this._editBtn);
    el.appendChild(this._unlinkBtn);

    // Keep tooltip alive while hovering it
    this._disposers.push(
      on(el, 'mouseenter', () => this._clearTimers()),
      on(el, 'mouseleave', () => this._scheduleHide()),
    );

    return el;
  }

  // Positions synchronously: the label text sets the width, so there is no
  // fresh layout to wait for.
  _show(anchor) {
    const isReadOnly = this.context.layoutInfo.container.classList.contains('an-disabled');
    const url = anchor.getAttribute('href') || '';
    this._urlLabel.textContent = this._truncateUrl(url);
    this._urlLabel.title = url;
    // In read-only mode keep only open + copy; hide edit and unlink
    this._editBtn.style.display   = isReadOnly ? 'none' : '';
    this._unlinkBtn.style.display = isReadOnly ? 'none' : '';
    this._el.style.display = 'flex';
    this._positionNear(anchor);
  }

  _truncateUrl(url) {
    try {
      const u = new URL(url);
      const display = u.host + (u.pathname === '/' ? '' : u.pathname);
      return display.length > 48 ? display.slice(0, 48) + '…' : display;
    } catch {
      return url.length > 48 ? url.slice(0, 48) + '…' : url;
    }
  }

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  _openLink() {
    const url = this._active?.getAttribute('href');
    if (url) globalThis.open(url, '_blank', 'noopener,noreferrer');
    this._hide();
  }

  _copyLink() {
    const url = this._active?.getAttribute('href');
    if (url) {
      writeClipboard({ text: url }).catch(() => {});
    }
    // Brief visual feedback  
    if (this._copyBtn) {
      this._copyBtn.classList.add('an-link-tooltip-btn--copied');
      setTimeout(() => this._copyBtn?.classList.remove('an-link-tooltip-btn--copied'), 1000);
    }
  }

  _editLink() {
    const anchor = this._active;
    if (!anchor) return;
    this._hide();

    // Place cursor inside the anchor, then open the link dialog (which pre-fills from selection)
    const sel = globalThis.getSelection();
    const range = document.createRange();
    range.selectNodeContents(anchor);
    sel.removeAllRanges();
    sel.addRange(range);

    this.context.invoke('linkDialog.show');
  }

  _unlink() {
    const anchor = this._active;
    if (!anchor) return;
    this._hide();

    // Put the caret in the link, then remove it (unlink takes the whole link)
    const sel = globalThis.getSelection();
    const range = document.createRange();
    range.selectNodeContents(anchor);
    sel.removeAllRanges();
    sel.addRange(range);

    Style.unlink(this.context.layoutInfo.editable);
    this.context.invoke('editor.afterCommand');
  }
}
