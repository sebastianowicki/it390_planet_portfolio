import { describe, it, expect } from 'vitest';
import { Vector3 } from 'three';
import { ringCapacity, slotFor, ringRadius, ringTilt, baseAngle } from '../src/scene/layout.js';
import { planetsFrom, homeOf, personRadius, SIZE_RADIUS, tagsOf, matches, lookup, diffPlanets, pathFor } from '../src/scene/model.js';
import { pageFor } from '../src/ui/window.js';
import { focusPose, poseAround } from '../src/scene/cameraDirector.js';

const galaxy = {
  title: "Team Orbit's Galaxy", color: '#4fb3c9', home: { appearance: { style: 'ocean' } },
  planets: [
    { slug: 'galaxy', title: 'Portfolio Galaxy', kind: 'project', size: 'large', tags: ['kubernetes'] },
    { slug: 'maya', title: 'Maya', kind: 'person', tags: [], appearance: { color: '#e0602b' }, projects: [
      { slug: 'proxy', title: 'Proxy lab', tags: ['nginx'] }, { slug: 'todo', title: 'To-do API', tags: ['flask'] }] },
    { slug: 'odd', title: 'Odd size', size: 'huge' },
  ],
};

describe('layout (ported from the original)', () => {
  it('fills rings 4, 5, 5, 6, 8, 10, then 2 more each', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(ringCapacity)).toEqual([4, 5, 5, 6, 8, 10, 12]);
  });
  it('puts the 5th planet first on ring 1', () => expect(slotFor(4)).toEqual({ ring: 1, slot: 0 }));
  it('spaces rings 14 apart from 20 and tilts them alternately', () => {
    expect(ringRadius(2)).toBe(48);
    expect(Math.sign(ringTilt(0))).toBe(-1);
    expect(Math.sign(ringTilt(1))).toBe(1);
  });
  it('spreads a ring evenly', () => expect(baseAngle(0, 2) - baseAngle(0, 1)).toBeCloseTo(Math.PI / 2));
});

describe('model', () => {
  const ps = planetsFrom(galaxy);
  it('makes project planets and person planets', () => {
    expect(ps.map((p) => p.kind)).toEqual(['project', 'person', 'project']);
  });
  it('sizes a project by its size and a person by their moons', () => {
    expect(ps[0].radius).toBe(SIZE_RADIUS.large);
    expect(ps[2].size).toBe('medium');
    expect(ps[1].radius).toBe(personRadius(2));
    expect(personRadius(1)).toBeLessThan(personRadius(6));
    expect(personRadius(20)).toBe(personRadius(6));
  });
  it('gives every moon an id under its planet', () => {
    expect(ps[1].moons.map((m) => m.id)).toEqual(['maya/proxy', 'maya/todo']);
    expect(ps[0].moons).toEqual([]);
  });
  it('colors planets without one from the galaxy color, and keeps their own', () => {
    expect(ps[1].color).toBe('#e0602b');
    expect(ps[0].color).toMatch(/^#[0-9a-f]{6}$/);
    expect(ps[0].color).not.toBe(ps[2].color);
  });
  it('gives the home planet the galaxy color from GALAXY_COLOR', () => {
    expect(homeOf(galaxy).appearance).toEqual({ style: 'ocean', color: '#4fb3c9' });
  });
  it('collects tags from planets and moons, and filters by them', () => {
    expect(tagsOf(ps)).toEqual(['flask', 'kubernetes', 'nginx']);
    expect(ps.filter((p) => matches(p, { tag: 'nginx' })).map((p) => p.slug)).toEqual(['maya']);
    expect(ps.filter((p) => matches(p, { q: 'to-do' })).map((p) => p.slug)).toEqual(['maya']);
  });
  it('finds what a page shows', () => {
    expect(lookup(galaxy, 'home').kind).toBe('home');
    expect(lookup(galaxy, 'maya/todo').title).toBe('To-do API');
    expect(lookup(galaxy, 'nope')).toBeNull();
  });
  it('sees a new moon as a change to its planet', () => {
    const more = structuredClone(galaxy);
    more.planets[1].projects.push({ slug: 'ci', title: 'CI' });
    const d = diffPlanets(ps, planetsFrom(more));
    expect(d.changed.map((p) => p.id)).toEqual(['maya']);
    expect(d.added).toEqual([]);
  });
});

describe('the window', () => {
  it('knows home, planet and moon pages, real and in the demo snapshot', () => {
    expect(pathFor('home')).toBe('/welcome');
    expect(pathFor('maya/todo')).toBe('/p/maya/todo');
    expect(pageFor('/welcome')).toEqual({ kind: 'home', id: 'home' });
    expect(pageFor('/p/maya')).toMatchObject({ kind: 'planet', id: 'maya' });
    expect(pageFor('/p/maya/todo')).toMatchObject({ kind: 'moon', id: 'maya/todo', planet: 'maya' });
    expect(pageFor('/x/team/p/maya/todo/index.html')).toMatchObject({ kind: 'moon', id: 'maya/todo' });
    expect(pageFor('/x/solo/welcome/tag-docker/index.html').kind).toBe('home');
    expect(pageFor('/')).toEqual({ kind: 'galaxy' });
  });
});

describe('camera', () => {
  it('focuses from outside the orbit, looking at the planet', () => {
    const p = new Vector3(20, 0, 0), { cam, tgt } = focusPose(p, 2);
    expect(tgt.equals(p)).toBe(true);
    expect(cam.x).toBeGreaterThan(p.x);
  });
  it('keeps the planet beside the page window while it is open', () => {
    const p = new Vector3(0, 0, 20), { cam, tgt } = poseAround(p, 2);
    expect(cam.distanceTo(p)).toBeGreaterThan(8);
    expect(tgt.distanceTo(p)).toBeCloseTo(5.2);
  });
});
