/**
 * Seat geometry for the Learn page's chamber pictures: `total` seats in
 * concentric half-circle rows (a hemicycle), the way the home page and the logo
 * draw a chamber. Pure maths with no React, so the server-rendered vote
 * pictures and the one client island (the state picker) share it.
 *
 * Seats come back in left-to-right sweep order, so "the first n seats" is a
 * contiguous wedge — a state's seats, or the yes votes.
 */
export type Seat = { x: number; y: number };

export function buildHemicycle(
  total: number,
  rows: number,
  innerRadius: number,
  outerRadius: number,
  cx: number,
  cy: number,
): Seat[] {
  const radii = Array.from(
    { length: rows },
    (_, i) => innerRadius + ((outerRadius - innerRadius) * i) / (rows - 1),
  );
  const radiiSum = radii.reduce((a, b) => a + b, 0);

  // Seats per row in proportion to the row's length, corrected to the exact total.
  const perRow = radii.map((r) => Math.round((r / radiiSum) * total));
  let diff = total - perRow.reduce((a, b) => a + b, 0);
  let fix = rows - 1;
  while (diff !== 0) {
    perRow[fix] += Math.sign(diff);
    diff -= Math.sign(diff);
    fix = fix === 0 ? rows - 1 : fix - 1;
  }

  const seats: (Seat & { angle: number })[] = [];
  radii.forEach((radius, row) => {
    const count = perRow[row];
    for (let s = 0; s < count; s++) {
      const angle = Math.PI * (1 - (count === 1 ? 0.5 : s / (count - 1)));
      seats.push({
        // One decimal: a tenth of a unit is invisible at these sizes, keeps a
        // thousand seats' markup small, and full precision differs between
        // server and browser trig, which would break hydration.
        x: Math.round((cx + radius * Math.cos(angle)) * 10) / 10,
        y: Math.round((cy - radius * Math.sin(angle)) * 10) / 10,
        angle,
      });
    }
  });
  seats.sort((a, b) => b.angle - a.angle);
  return seats.map(({ x, y }) => ({ x, y }));
}

/** Two decimals, so `x - r` prints as 9.1 and not 9.100000000000001. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The seats as ONE svg path of circles, for a single `<path d>`.
 *
 * Each seat used to be its own `<circle>`: 1,070 of them on /learn, well over
 * half the page's elements. Opening the state picker's Select makes the browser
 * recalculate style for the whole document, and every one of those elements
 * paid for it — on school Chromebooks the picker took about a third of a second
 * to open, and it became the site's top rage-click target. A path draws the same
 * circles as one element.
 */
export function seatsPath(seats: Seat[], r: number): string {
  const d = round2(2 * r);
  return seats
    .map((s) => `M${round2(s.x - r)} ${s.y}a${r} ${r} 0 1 0 ${d} 0a${r} ${r} 0 1 0 ${-d} 0`)
    .join('');
}
