/**
 * BaseMediaTooltip.js — Shared hover-tooltip behaviour.
 *
 * The image, video, link, code and table tooltips each carried their own copy
 * of the button factory, show/hide timers and viewport-aware positioning. Those
 * pieces live here; each subclass keeps only what genuinely differs — which
 * element counts as the target, which buttons the bar contains, the actions
 * behind them, and (through the constructor) its delays and placement.
 *
 * Mirrors the existing BaseDialog / BaseResizer pattern.
 */

import { createElement, on, setIcon } from '../core/dom.js';

/** Delay before a hovered target shows its tooltip. */
export const SHOW_DELAY = 100;
/** Grace period before a tooltip hides after the pointer leaves. */
export const HIDE_DELAY = 180;

/**
 * Where the bar sits relative to its target.
 * @typedef {object} TooltipPlacement
 * @property {boolean} above - Prefer above the target (else below).
 * @property {boolean} center - Center on the target (else align left edges).
 * @property {number} w - Width to assume while the bar is not laid out.
 * @property {number} h - Height to assume while the bar is not laid out.
 */

export class BaseMediaTooltip {
  /**
   * @param {import('../Context.js').Context} context
   * @param {number} [showDelay]
   * @param {number} [hideDelay]
   * @param {TooltipPlacement} [place]
   */
  constructor(context, showDelay = SHOW_DELAY, hideDelay = HIDE_DELAY,
    place = { above: false, center: true, w: 220, h: 32 }) {
    this.context = context;
    this.options = context.options;
    this._showDelay = showDelay;
    this._hideDelay = hideDelay;
    /** @type {TooltipPlacement} */
    this._place = place;
    /** @type {HTMLElement|null} The tooltip bar */
    this._el = null;
    /** @type {HTMLElement|null} Currently hovered target */
    this._active = null;
    this._showTimer = null;
    this._hideTimer = null;
    /** When true, a pending hide is left running instead of restarted. */
    this._keepHideTimer = false;
    this._disposers = [];
  }

  destroy() {
    this._clearTimers();
    this._disposers.forEach((d) => d());
    this._disposers = [];
    this._el?.remove();
    this._el = null;
  }

  // ---------------------------------------------------------------------------
  // Subclass hooks
  // ---------------------------------------------------------------------------

  /**
   * Whether `_scheduleHide` is allowed to start the hide countdown. Subclasses
   * override to pin the tooltip open (e.g. while a video preview is playing).
   * @returns {boolean}
   */
  _canHide() { return true; }

  /** Runs just before the tooltip is hidden, for subclass-specific teardown. */
  _beforeHide() {}

  // ---------------------------------------------------------------------------
  // Buttons
  // ---------------------------------------------------------------------------

  /**
   * Builds a tooltip button and registers its click disposer.
   * @param {string} icon - inline SVG markup
   * @param {string} title
   * @param {() => void} handler
   * @param {boolean} [isDanger]
   * @returns {HTMLElement}
   */
  _makeBtn(icon, title, handler, isDanger = false) {
    const btn = createElement('button', {
      type: 'button',
      class: isDanger ? 'an-link-tooltip-btn an-link-tooltip-btn--danger' : 'an-link-tooltip-btn',
      title,
    });
    setIcon(btn, icon);
    this._disposers.push(on(btn, 'click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handler();
    }));
    return btn;
  }

  // ---------------------------------------------------------------------------
  // Show / Hide
  // ---------------------------------------------------------------------------

  _scheduleShow(target) {
    if (this._active === target && this._el.style.display !== 'none') return;
    clearTimeout(this._hideTimer);
    this._hideTimer = null;
    clearTimeout(this._showTimer);
    this._showTimer = setTimeout(() => {
      if (!target.isConnected) return;
      this._active = target;
      this._show(target);
    }, this._showDelay);
  }

  _scheduleHide() {
    if (!this._canHide()) return;
    clearTimeout(this._showTimer);
    this._showTimer = null;
    if (this._keepHideTimer && this._hideTimer) return;
    // Otherwise reset the hide timer so rapid mouseout→mouseover sequences
    // don't leave a stale timer that hides the tooltip prematurely.
    clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => this._hide(), this._hideDelay);
  }

  _show(_target) {
    this._el.style.display = 'flex';
    // Defer positioning: offsetWidth on a newly-visible element forces layout
    requestAnimationFrame(() => {
      if (this._active) this._positionNear(this._active);
    });
  }

  _hide() {
    this._beforeHide();
    this._el.style.display = 'none';
    this._active = null;
    this._clearTimers();
  }

  _clearTimers() {
    clearTimeout(this._showTimer);
    clearTimeout(this._hideTimer);
    this._showTimer = null;
    this._hideTimer = null;
  }

  /**
   * Places the bar on its preferred side of the target, flipping to the other
   * side and clamping horizontally when it would leave the viewport.
   * @param {HTMLElement} target
   */
  _positionNear(target) {
    // Nothing to follow (hidden before a deferred call ran): leave it be.
    if (!target) return;
    // A drag-move inside the editor replaces the node; a detached one has an
    // all-zero rect and would pin the tooltip to the viewport corner.
    if (!target.isConnected) { this._hide(); return; }
    const { above, center, w, h } = this._place;
    const rect   = target.getBoundingClientRect();
    const tipW   = this._el.offsetWidth  || w;
    const tipH   = this._el.offsetHeight || h;
    const margin = 6;
    const below  = rect.bottom + margin;
    const over   = rect.top - tipH - margin;

    const top = above
      ? (over < margin ? below : over)
      : (below + tipH > globalThis.innerHeight - margin ? over : below);
    const left = Math.max(margin, Math.min(
      center ? rect.left + (rect.width - tipW) / 2 : rect.left,
      globalThis.innerWidth - tipW - margin,
    ));

    this._el.style.top  = `${top}px`;
    this._el.style.left = `${left}px`;
  }
}
