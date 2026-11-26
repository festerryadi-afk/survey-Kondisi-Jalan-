import type { Plugin } from 'vite';

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

function linearToSrgb(c: number): number {
  const clamped = Math.max(0, Math.min(1, c));
  return clamped <= 0.0031308
    ? 12.92 * clamped
    : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
}

function oklchToRgbaTuple(
  lRaw: string,
  cRaw: string,
  hRaw: string
): [number, number, number] | null {
  const L = lRaw.endsWith('%') ? parseFloat(lRaw) / 100 : parseFloat(lRaw);
  const C = parseFloat(cRaw);
  const H = hRaw === 'none' ? 0 : parseFloat(hRaw);
  if (!Number.isFinite(L) || !Number.isFinite(C) || !Number.isFinite(H)) return null;

  const rad = (H * Math.PI) / 180;
  const a = C * Math.cos(rad);
  const b = C * Math.sin(rad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;

  const rLin = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  return [
    clampByte(linearToSrgb(rLin)),
    clampByte(linearToSrgb(gLin)),
    clampByte(linearToSrgb(bLin)),
  ];
}

function parseAlpha(alphaRaw: string | undefined): number {
  if (!alphaRaw) return 1;
  const trimmed = alphaRaw.trim();
  if (trimmed.endsWith('%')) {
    return Math.max(0, Math.min(1, parseFloat(trimmed) / 100));
  }
  const n = parseFloat(trimmed);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
}

function replaceOklchColors(css: string): string {
  return css.replace(
    /oklch\(\s*([^\s/)]+)\s+([^\s/)]+)\s+([^\s/)]+)(?:\s*\/\s*([^)]+))?\s*\)/gi,
    (full, l, c, h, a) => {
      const rgb = oklchToRgbaTuple(l, c, h);
      if (!rgb) return full;
      const alpha = parseAlpha(a);
      return alpha < 1
        ? `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Number(alpha.toFixed(3))})`
        : `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    }
  );
}

function parseHexOrRgb(expr: string): [number, number, number] | null {
  const s = expr.trim().toLowerCase();
  if (s === '#000' || s === '#000000' || s === 'black') return [0, 0, 0];
  if (s === '#fff' || s === '#ffffff' || s === 'white') return [255, 255, 255];

  const hex3 = s.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (hex3) {
    return [
      parseInt(hex3[1] + hex3[1], 16),
      parseInt(hex3[2] + hex3[2], 16),
      parseInt(hex3[3] + hex3[3], 16),
    ];
  }
  const hex6 = s.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hex6) {
    return [parseInt(hex6[1], 16), parseInt(hex6[2], 16), parseInt(hex6[3], 16)];
  }
  const rgbMatch = s.match(/^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)/);
  if (rgbMatch) {
    return [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
  }
  return null;
}

function extractColorVars(css: string): Map<string, [number, number, number]> {
  const map = new Map<string, [number, number, number]>();
  const re = /(--color-[a-z0-9-]+)\s*:\s*([^;{}]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const parsed = parseHexOrRgb(m[2]);
    if (parsed) {
      map.set(m[1].toLowerCase(), parsed);
    }
  }
  return map;
}

function findMatchingBrace(str: string, openIdx: number): number {
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  for (let i = openIdx; i < str.length; i++) {
    const ch = str[i];
    const prev = i > 0 ? str[i - 1] : '';
    if (ch === "'" && !inDouble && prev !== '\\') inSingle = !inSingle;
    else if (ch === '"' && !inSingle && prev !== '\\') inDouble = !inDouble;
    else if (!inSingle && !inDouble) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

function unwrapAtRuleBlocks(
  css: string,
  shouldUnwrap: (prelude: string) => 'unwrap' | 'strip' | 'keep'
): string {
  let out = '';
  let i = 0;
  while (i < css.length) {
    if (css[i] === '@') {
      const openBrace = css.indexOf('{', i);
      const semi = css.indexOf(';', i);
      if (openBrace !== -1 && (semi === -1 || openBrace < semi)) {
        const prelude = css.slice(i, openBrace).trim();
        const closeBrace = findMatchingBrace(css, openBrace);
        if (closeBrace !== -1) {
          const action = shouldUnwrap(prelude);
          if (action === 'strip') {
            i = closeBrace + 1;
            continue;
          }
          if (action === 'unwrap') {
            const inner = css.slice(openBrace + 1, closeBrace);
            out += unwrapAtRuleBlocks(inner, shouldUnwrap);
            i = closeBrace + 1;
            continue;
          }
        }
      }
    }
    out += css[i];
    i++;
  }
  return out;
}

function splitTopLevelCommas(expr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      parts.push(expr.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(expr.slice(start).trim());
  return parts;
}

function replaceColorMix(css: string, colorVars: Map<string, [number, number, number]>): string {
  let result = '';
  let i = 0;
  const target = 'color-mix(';
  while (i < css.length) {
    const idx = css.indexOf(target, i);
    if (idx === -1) {
      result += css.slice(i);
      break;
    }
    result += css.slice(i, idx);

    let depth = 0;
    let end = -1;
    for (let j = idx + target.length - 1; j < css.length; j++) {
      if (css[j] === '(') depth++;
      else if (css[j] === ')') {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    if (end === -1) {
      result += css.slice(idx);
      break;
    }

    const inner = css.slice(idx + target.length, end).trim();
    const parts = splitTopLevelCommas(inner);
    // Format: in oklab, <color> <pct>%, transparent (or var(--tw-shadow-alpha))
    let converted: string | null = null;
    if (parts.length === 3) {
      const colorPart = parts[1];
      const pctMatch = colorPart.match(/^(.*?)\s+([0-9.]+)%$/);
      const varAlphaMatch = !pctMatch ? colorPart.match(/^(.*?)\s+var\(--tw-shadow-alpha\)$/i) : null;
      if (pctMatch || varAlphaMatch) {
        const colorExpr = (pctMatch ? pctMatch[1] : varAlphaMatch![1]).trim();
        const alpha = pctMatch
          ? Math.max(0, Math.min(1, parseFloat(pctMatch[2]) / 100))
          : 1;
        let rgb: [number, number, number] | null = null;

        const varMatch = colorExpr.match(/^var\((--color-[a-z0-9-]+)\)$/i);
        if (varMatch) {
          rgb = colorVars.get(varMatch[1].toLowerCase()) || null;
        } else {
          rgb = parseHexOrRgb(colorExpr);
        }

        if (rgb) {
          converted = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${Number(alpha.toFixed(3))})`;
        } else if (colorExpr.toLowerCase() === 'currentcolor') {
          converted = `rgba(148,163,184,${Number(alpha.toFixed(3))})`;
        }
      }
    }

    result += converted ?? css.slice(idx, end + 1);
    i = end + 1;
  }
  return result;
}

function convertSpaceRgbSyntax(css: string): string {
  return css.replace(
    /rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*\/\s*([^)]+)\)/gi,
    (_m, r, g, b, a) => {
      const alpha = parseAlpha(a);
      return `rgba(${r},${g},${b},${Number(alpha.toFixed(3))})`;
    }
  );
}

function expandLogicalProperties(css: string): string {
  let out = css;

  // Helper: only match actual property declarations preceded by start, ';', '{', or whitespace after ';'/'{'
  out = out.replace(/(^|[;{])\s*inset-inline\s*:\s*([^;{}]+)/gi, (_m, sep, val) => {
    const parts = val.trim().split(/\s+/);
    const l = parts[0];
    const r = parts[1] ?? l;
    return `${sep}left:${l};right:${r}`;
  });
  out = out.replace(/(^|[;{])\s*inset-block\s*:\s*([^;{}]+)/gi, (_m, sep, val) => {
    const parts = val.trim().split(/\s+/);
    const t = parts[0];
    const b = parts[1] ?? t;
    return `${sep}top:${t};bottom:${b}`;
  });
  out = out.replace(/(^|[;{])\s*inset\s*:\s*([^;{}]+)/gi, (_m, sep, val) => {
    const parts = val.trim().split(/\s+/);
    const t = parts[0];
    const r = parts[1] ?? t;
    const b = parts[2] ?? t;
    const l = parts[3] ?? r;
    return `${sep}top:${t};right:${r};bottom:${b};left:${l}`;
  });

  // padding-inline / padding-block
  out = out.replace(
    /(^|[;{])\s*padding-inline-start\s*:\s*([^;{}]+)/gi,
    '$1padding-left:$2'
  );
  out = out.replace(
    /(^|[;{])\s*padding-inline-end\s*:\s*([^;{}]+)/gi,
    '$1padding-right:$2'
  );
  out = out.replace(/(^|[;{])\s*padding-inline\s*:\s*([^;{}]+)/gi, (_m, sep, val) => {
    const parts = val.trim().split(/\s+/);
    const l = parts[0];
    const r = parts[1] ?? l;
    return `${sep}padding-left:${l};padding-right:${r}`;
  });
  out = out.replace(
    /(^|[;{])\s*padding-block-start\s*:\s*([^;{}]+)/gi,
    '$1padding-top:$2'
  );
  out = out.replace(
    /(^|[;{])\s*padding-block-end\s*:\s*([^;{}]+)/gi,
    '$1padding-bottom:$2'
  );
  out = out.replace(/(^|[;{])\s*padding-block\s*:\s*([^;{}]+)/gi, (_m, sep, val) => {
    const parts = val.trim().split(/\s+/);
    const t = parts[0];
    const b = parts[1] ?? t;
    return `${sep}padding-top:${t};padding-bottom:${b}`;
  });

  // margin-inline / margin-block
  out = out.replace(
    /(^|[;{])\s*margin-inline-start\s*:\s*([^;{}]+)/gi,
    '$1margin-left:$2'
  );
  out = out.replace(
    /(^|[;{])\s*margin-inline-end\s*:\s*([^;{}]+)/gi,
    '$1margin-right:$2'
  );
  out = out.replace(/(^|[;{])\s*margin-inline\s*:\s*([^;{}]+)/gi, (_m, sep, val) => {
    const parts = val.trim().split(/\s+/);
    const l = parts[0];
    const r = parts[1] ?? l;
    return `${sep}margin-left:${l};margin-right:${r}`;
  });
  out = out.replace(
    /(^|[;{])\s*margin-block-start\s*:\s*([^;{}]+)/gi,
    '$1margin-top:$2'
  );
  out = out.replace(
    /(^|[;{])\s*margin-block-end\s*:\s*([^;{}]+)/gi,
    '$1margin-bottom:$2'
  );
  out = out.replace(/(^|[;{])\s*margin-block\s*:\s*([^;{}]+)/gi, (_m, sep, val) => {
    const parts = val.trim().split(/\s+/);
    const t = parts[0];
    const b = parts[1] ?? t;
    return `${sep}margin-top:${t};margin-bottom:${b}`;
  });

  // border-inline-*
  out = out.replace(
    /(^|[;{])\s*border-inline-style\s*:\s*([^;{}]+)/gi,
    '$1border-left-style:$2;border-right-style:$2'
  );
  out = out.replace(
    /(^|[;{])\s*border-inline-width\s*:\s*([^;{}]+)/gi,
    '$1border-left-width:$2;border-right-width:$2'
  );
  out = out.replace(
    /(^|[;{])\s*border-inline-color\s*:\s*([^;{}]+)/gi,
    '$1border-left-color:$2;border-right-color:$2'
  );

  // individual transform properties -> classic transform for Chrome < 104
  out = out.replace(
    /(^|[;{])\s*translate\s*:\s*var\(--tw-translate-x\)\s+var\(--tw-translate-y\)/gi,
    '$1transform:translate(var(--tw-translate-x),var(--tw-translate-y))'
  );
  out = out.replace(/(^|[;{])\s*translate\s*:\s*([^;{}]+)/gi, (_m, sep, val) => {
    const parts = val.trim().split(/\s+/);
    if (parts.length === 1) return `${sep}transform:translateX(${parts[0]})`;
    return `${sep}transform:translate(${parts[0]},${parts[1]})`;
  });
  out = out.replace(
    /(^|[;{])\s*scale\s*:\s*var\(--tw-scale-x\)\s+var\(--tw-scale-y\)/gi,
    '$1transform:scale(var(--tw-scale-x),var(--tw-scale-y))'
  );
  out = out.replace(/(^|[;{])\s*scale\s*:\s*([^;{}]+)/gi, (_m, sep, val) => {
    const parts = val.trim().split(/\s+/);
    if (parts.length === 1) return `${sep}transform:scale(${parts[0]})`;
    return `${sep}transform:scale(${parts[0]},${parts[1]})`;
  });
  out = out.replace(/(^|[;{])\s*rotate\s*:\s*([^;{}]+)/gi, '$1transform:rotate($2)');

  return out;
}

function simplifyModernSelectors(css: string): string {
  let out = css;

  // .group-hover\:foo:is(:where(.group):hover *) -> .group:hover .group-hover\:foo
  out = out.replace(
    /(\.[a-zA-Z0-9_\\:-]+):is\(:where\(\.group\):hover \*\)/g,
    '.group:hover $1'
  );

  // :where(.space-x-2>:not(:last-child)) -> .space-x-2>:not(:last-child)
  out = out.replace(/:where\((\.[^)]+)\)/g, '$1');

  // Preflight & fallback selectors with :where()
  out = out.replace(/abbr:where\(\[title\]\)/g, 'abbr[title]');
  out = out.replace(/\[hidden\]:where\(:not\(\[hidden=until-found\]\)\)/g, '[hidden]');
  out = out.replace(
    /input:where\(\[type=button\],\[type=reset\],\[type=submit\]\)/g,
    'input[type=button],input[type=reset],input[type=submit]'
  );
  out = out.replace(/:where\((select:-webkit-any\([^)]+\))\)/g, '$1');
  out = out.replace(/:where\(select:is\(\[multiple\],\[size\]\)\)/g, 'select[multiple],select[size]');
  out = out.replace(/:-moz-focusring:where\(:not\(iframe\)\)/g, ':-moz-focusring');

  return out;
}

export function downgradeCssForAndroidWebView(css: string): string {
  // 1. Strip @layer statements (e.g. @layer components;), unwrap @layer/@supports blocks, strip @property
  let out = css.replace(/@layer\s+[a-zA-Z0-9_,\s-]+;/g, '');
  out = unwrapAtRuleBlocks(out, (prelude) => {
    if (prelude.startsWith('@property')) return 'strip';
    if (prelude.startsWith('@layer')) return 'unwrap';
    if (
      prelude.startsWith('@supports') &&
      (prelude.includes('color-mix(') ||
        prelude.includes('margin-trim:inline') ||
        prelude.includes('-apple-pay-button'))
    ) {
      return 'unwrap';
    }
    return 'keep';
  });

  // 2. Convert oklch(...) -> rgb()/rgba()
  out = replaceOklchColors(out);

  // 3. Extract --color-* palette and replace color-mix(...) -> rgba() (2 passes for nested color-mix)
  const colorVars = extractColorVars(out);
  out = replaceColorMix(out, colorVars);
  out = replaceColorMix(out, colorVars);

  // 4. Convert space-separated rgb(r g b / a) -> rgba(r, g, b, a)
  out = convertSpaceRgbSyntax(out);

  // 5. Expand logical CSS properties & individual transforms
  out = expandLogicalProperties(out);

  // 6. Simplify :where() / :is() selectors for older Chrome WebView
  out = simplifyModernSelectors(out);

  // 7. Ensure safe root dark theme & button reset fallback for Android 7-9 WebView
  out =
    'html,body{background-color:#020617;color:#f8fafc;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;}button{background:transparent;color:inherit;border:0;}' +
    out;

  return out;
}

export function androidLegacyCssPlugin(): Plugin {
  return {
    name: 'android-legacy-webview-css-compat',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        const chunk = bundle[fileName];
        if (chunk.type === 'asset' && fileName.endsWith('.css')) {
          const sourceText =
            typeof chunk.source === 'string'
              ? chunk.source
              : Buffer.from(chunk.source).toString('utf8');
          chunk.source = downgradeCssForAndroidWebView(sourceText);
        }
      }
    },
  };
}
