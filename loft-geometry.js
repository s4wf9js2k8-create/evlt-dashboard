// Relative coordinates keep a saved layout consistent on phones and desktops.
globalThis.LoftGeometry = (() => {
  const clamp = (v, min, max) => Math.max(min, Math.min(max, Number(v)));
  const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const onSegment = (p, a, b) => Math.abs(cross(a, b, p)) < 0.00001 && p.x >= Math.min(a.x, b.x) - 0.00001 && p.x <= Math.max(a.x, b.x) + 0.00001 && p.y >= Math.min(a.y, b.y) - 0.00001 && p.y <= Math.max(a.y, b.y) + 0.00001;
  function intersects(a, b, c, d) {
    const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
    return (abC * abD < 0 && cdA * cdB < 0) || onSegment(c, a, b) || onSegment(d, a, b) || onSegment(a, c, d) || onSegment(b, c, d);
  }
  function inside(p, polygon) {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[j], b = polygon[i];
      if (onSegment(p, a, b)) return true;
      if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) result = !result;
    }
    return result;
  }
  function validOutline(points) {
    if (!Array.isArray(points) || points.length < 3 || points.length > 50) return false;
    if (points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100)) return false;
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      if (Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) < 0.1) return false;
      area += points[i].x * points[j].y - points[j].x * points[i].y;
      for (let k = i + 1; k < points.length; k++) {
        const l = (k + 1) % points.length;
        if (j === k || l === i) continue;
        if (intersects(points[i], points[j], points[k], points[l])) return false;
      }
    }
    return Math.abs(area) > 20;
  }
  function rectFits(rect, polygon) {
    if (![rect.x, rect.y, rect.w, rect.h].every(Number.isFinite) || rect.w < 2 || rect.h < 2) return false;
    const corners = [{ x: rect.x, y: rect.y }, { x: rect.x + rect.w, y: rect.y }, { x: rect.x + rect.w, y: rect.y + rect.h }, { x: rect.x, y: rect.y + rect.h }];
    if (!corners.every(p => inside(p, polygon))) return false;
    // An edge can cross a recess even when all four corners are inside.
    for (let edge = 0; edge < 4; edge++) {
      const a = corners[edge], b = corners[(edge + 1) % 4], ts = [0, 1];
      for (let i = 0; i < polygon.length; i++) {
        const c = polygon[i], d = polygon[(i + 1) % polygon.length];
        const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
        if (Math.abs(denominator) < 1e-8) continue;
        const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denominator;
        const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denominator;
        if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
      }
      ts.sort((a, b) => a - b);
      for (let i = 1; i < ts.length; i++) {
        const t = (ts[i - 1] + ts[i]) / 2;
        if (!inside({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, polygon)) return false;
      }
    }
    return true;
  }
  const rectangle = () => [{ x: 5, y: 5 }, { x: 95, y: 5 }, { x: 95, y: 95 }, { x: 5, y: 95 }];
  return { clamp, inside, validOutline, rectFits, rectangle };
})();

