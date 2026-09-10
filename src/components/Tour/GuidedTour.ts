// src/components/Tour/GuidedTour.ts
//
// The guided tour. driver.js (~5kb) rather than react-joyride (~30kb) — this
// needs a spotlight and a popover, not a state machine.
//
// Two rules shape every step below:
//
//   1. A step is only shown if its anchor is actually on screen. The workspace
//      does not exist until a PR has been analyzed, so a tour started from an
//      empty app would spotlight nothing and read as broken. `visibleSteps`
//      filters first, and the tour is a different (shorter) tour before an
//      analysis than after one. That is deliberate, not a limitation.
//   2. Steps describe what the thing is FOR, not what it is called. "Post
//      comments" is visible on the button already; that the posting is a dry
//      run first, and that nothing reaches GitHub without a second click, is
//      not.

import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';

/** Remembers that the tour has been offered, so it auto-runs exactly once. */
const SEEN_KEY = 'pra.tour.seen.v1';

interface Step {
  /** `[data-tour="…"]` value. Absent anchors are skipped, not faked. */
  anchor: string;
  title: string;
  text: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

const STEPS: Step[] = [
  {
    anchor: 'url-input',
    title: 'Paste a pull request',
    text:
      'Any public GitHub PR URL. The analyzer reads the diff — application '
      + 'code, not framework internals — and never needs the repository cloned.',
    side: 'bottom',
  },
  {
    anchor: 'analyze',
    title: 'Analyze reads the code',
    text:
      'Static rules and a component graph, both deterministic. The in-depth '
      + 'review that asks a model about the diff is a separate, opt-in button — '
      + 'so a normal analysis costs nothing and cannot hallucinate.',
    side: 'bottom',
  },
  {
    anchor: 'token',
    title: 'A token, only when you need one',
    text:
      'Public PRs need nothing. A token raises your rate limit, reaches private '
      + 'repos, and is what lets you post comments as yourself. It stays in this '
      + 'browser and is sent only to your own backend.',
    side: 'bottom',
  },
  {
    anchor: 'triage',
    title: 'What is wrong, worst first',
    text:
      'Every row is anchored to a real added line. "Locate" pans the graph to '
      + 'the file it came from. If a finding cannot be tied to a line, it is '
      + 'listed rather than guessed onto one.',
    side: 'right',
  },
  {
    anchor: 'action-bar',
    title: 'Review, comment, history',
    text:
      'Posting is a dry run first: you see the exact comments, edit any of them, '
      + 'and nothing reaches GitHub until you confirm. History shows which '
      + 'findings each push fixed — matched on the code, so it survives a rebase.',
    side: 'bottom',
  },
  {
    anchor: 'canvas',
    title: 'How the code connects',
    text:
      'Routes, components and the calls between them, laid out left to right. '
      + 'Click any node to trace what reaches it. Drag to pan, scroll to zoom.',
    side: 'top',
  },
  {
    anchor: 'export',
    title: 'Take it with you',
    text: 'Exports the whole graph as a PNG at full resolution, not just the part on screen.',
    side: 'top',
  },
  {
    anchor: 'views',
    title: 'Every PR you have looked at',
    text:
      'History keeps a board of analyzed PRs in this browser. Re-opening one '
      + 'restores it without re-running the analysis.',
    side: 'bottom',
  },
];

/** Only steps whose anchor is currently rendered AND visible. */
function visibleSteps(): DriveStep[] {
  return STEPS.flatMap<DriveStep>(step => {
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.anchor}"]`);
    // offsetParent is null for display:none — the graph column is hidden
    // rather than unmounted while a panel is open, and spotlighting a hidden
    // element puts the popover in the corner pointing at nothing.
    if (!el || (el.offsetParent === null && el.getClientRects().length === 0)) return [];

    return [{
      element: el,
      popover: {
        title: step.title,
        description: step.text,
        side: step.side ?? 'bottom',
        align: 'start',
      },
    }];
  });
}

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    // Private windows and blocked site data throw on access. Treating that as
    // "already seen" is the safe read: a tour that reappears on every load is
    // worse than one that never auto-starts.
    return true;
  }
}

export function markTourSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* not worth failing a tour over */
  }
}

/**
 * Runs the tour over whatever is currently on screen.
 *
 * Returns false when there was nothing to point at, so the caller can say so
 * instead of flashing an empty overlay.
 */
export function startTour(): boolean {
  const steps = visibleSteps();
  if (steps.length === 0) return false;

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const d = driver({
    steps,
    animate: !reduced,
    overlayColor: 'rgba(0,0,0,0.62)',
    stagePadding: 6,
    stageRadius: 8,
    allowClose: true,
    showProgress: steps.length > 1,
    progressText: '{{current}} of {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    onDestroyed: markTourSeen,
  });

  d.drive();
  return true;
}
