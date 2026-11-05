// Guided tour: short lessons that drive the real controls with real calculations.
import { h } from './panels.js';

export const LESSONS = [
  {
    title: 'Light at the pole vs. the mare',
    body: 'Odysseus (IM-1) landed 80° south; Blue Ghost 1 landed 18° north in Mare Crisium. Play the next three days and watch the gold Sun numbers and the gold sunlight bars in the time bar. Near the pole the Sun circles low along the horizon instead of climbing high, so a few degrees of terrain decide whether a lander has power.',
    setup: { sites: ['im1', 'blue-ghost'], view: 'moon', windowDays: 3 },
    action: { label: 'Play the next 3 days', run: (a) => a.play(3600) },
  },
  {
    title: 'A ridge can steal the day',
    body: 'Athena (IM-2) landed on Mons Mouton, close to the south pole. Its sky chart shows the real LOLA horizon around the site, the Sun’s path in gold and Earth’s in teal. Switch between the terrain horizon and a flat horizon: the difference is sunlight that ridges and crater rims take away.',
    setup: { sites: ['im2'], view: 'moon', focusSite: 'im2', windowDays: 3 },
    action: { label: 'Switch terrain ↔ flat horizon', run: (a) => a.toggleHorizon() },
  },
  {
    title: 'Every signal needs a way home',
    body: 'This view looks back at Earth from the Moon. Six Deep Space Network antennas ride on the rotating Earth. A site has a line home only when an antenna sees the Moon more than 10° above its horizon and the site sees Earth above its own terrain. Advance six hours and watch the table change.',
    setup: { sites: ['im1', 'im2', 'blue-ghost'], view: 'earth', windowDays: 3 },
    action: { label: 'Advance 6 hours', run: (a) => a.advance(6 * 3600000) },
  },
  {
    title: 'Plan a mission window',
    body: 'Landers need power and contact at the same time. The time bar shows one lane per site: gold where the Sun is up, teal where a DSN antenna can hear it. Click a lane, or an event in a site card, to jump there. Sunlight and contact windows rarely line up perfectly.',
    setup: { sites: ['im1', 'im2'], view: 'moon', windowDays: 7 },
    action: { label: 'Open the sunrise list for IM-1', run: (a) => a.openEvents('im1') },
  },
  {
    title: 'Odysseus at touchdown',
    body: 'Odysseus touched down on 22 February 2024 at 23:23 UTC. Jump to that minute to see the Sun angle and Earth position the lander faced near Malapert A, then play forward through the lunar morning.',
    setup: { sites: ['im1'], view: 'moon', focusSite: 'im1', windowDays: 3 },
    action: { label: 'Jump to touchdown', run: (a) => a.jumpToLanding('im1') },
  },
  {
    title: 'Screen your own landing site',
    body: 'Discover tests a 5 × 5 grid around a point: terrain and landing-ellipse evidence first, then sunlight and DSN contact at the chosen time. Even passing candidates keep many criteria unknown. Which measurements would a real mission still need?',
    setup: { sites: ['im2'], view: 'moon', tab: 'discover', windowDays: 3, discover: { latitude: -84.79, longitude: 29.2, spacing: '0.1' } },
    action: { label: 'Screen around Mons Mouton', run: (a) => a.scan() },
  },
];

export function createTour(listHost, cardHost, actions) {
  let index = -1;
  let saved = null;

  function list() {
    return [
      h('p', { class: 'eyebrow', text: 'Guided tour' }),
      h('h1', { text: 'Learn how light and radio shape a landing.' }),
      h('p', { class: 'lede', text: `${LESSONS.length} short steps. Each one sets up the view and runs real NASA/JPL calculations; your own setup comes back when you exit.` }),
      h('button', { type: 'button', class: 'primary block', onClick: () => start(0) }, 'Start the tour'),
      h('ol', { class: 'lesson-list' }, LESSONS.map((lesson, i) => h('li', null,
        h('button', { type: 'button', class: 'lesson-item', onClick: () => start(i) },
          h('span', { class: 'lesson-number', text: String(i + 1) }), h('span', { text: lesson.title }))))),
    ];
  }

  function card() {
    const lesson = LESSONS[index];
    const dots = h('span', { class: 'tour-dots', 'aria-hidden': 'true' }, LESSONS.map((_, i) => h('i', { class: i === index ? 'on' : '' })));
    return [
      h('div', { class: 'tour-top' },
        h('p', { class: 'eyebrow', text: `Guided tour · ${index + 1} of ${LESSONS.length}` }),
        h('button', { type: 'button', class: 'link-button', onClick: () => exit() }, 'Exit')),
      h('h2', { text: lesson.title }),
      h('p', { text: lesson.body }),
      h('button', { type: 'button', class: 'primary block', onClick: () => lesson.action.run(actions) }, lesson.action.label),
      h('div', { class: 'tour-nav' },
        h('button', { type: 'button', class: 'ghost small', disabled: index === 0, onClick: () => go(index - 1) }, '← Back'),
        dots,
        h('button', { type: 'button', class: 'ghost small', onClick: () => (index === LESSONS.length - 1 ? exit() : go(index + 1)) }, index === LESSONS.length - 1 ? 'Finish' : 'Next →')),
    ];
  }

  function render() {
    listHost.replaceChildren(...list());
    cardHost.hidden = index < 0;
    cardHost.replaceChildren(...(index < 0 ? [] : card()));
  }

  function go(i) {
    index = i;
    actions.apply(LESSONS[i].setup);
    render();
    cardHost.querySelector('h2')?.focus?.();
  }

  function start(i = 0) {
    if (index < 0) saved = actions.snapshot();
    go(i);
    cardHost.scrollIntoView?.({ block: 'nearest' });
  }

  function exit() {
    index = -1;
    if (saved) actions.restore(saved);
    saved = null;
    render();
  }

  render();
  return { start, exit, get active() { return index >= 0; } };
}
