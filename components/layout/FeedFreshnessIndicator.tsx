// Pinned to the Shell header. Tells the AM whether the BQ ops feed is fresh.
// One global indicator — not a per-partner flag. Async server component so it
// fetches its own state independently of the page.
//
// Bands:
//   < 24h  → green  "Live · 4h"
//   < 36h  → green  "Live · 1d"      (lenient — daily ETL with weekend lag)
//   < 72h  → amber  "Stale · 2d"
//   ≥ 72h  → red    "Stale · 4d"
//   null   → red    "Data unavailable"

import { getFeedFreshness } from '@/lib/bq/use';
import { tokens } from '@/components/primitives';

const { colors, fonts, radii, space, text } = tokens;

function fmtAge(hours: number): string {
  if (hours < 1) return '< 1h';
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}

export async function FeedFreshnessIndicator() {
  const { maxOrderDate, queriedAt, error } = await getFeedFreshness();

  // Three failure shapes, distinguished so the AM knows who to escalate to:
  //   - error set       → our code / auth / network broke (escalate to dev)
  //   - error null, maxOrderDate null → BQ table genuinely returned no rows
  //                                      in the last 7 days (escalate to data team)
  //   - error null, maxOrderDate set, age within bands → live / stale UI
  if (error) {
    return (
      <Pill
        dot={colors.red}
        bg={colors.redSoft}
        fg={colors.red}
        label="App error"
        sub={`Could not reach BigQuery: ${error.slice(0, 200)}`}
      />
    );
  }
  if (!maxOrderDate) {
    return (
      <Pill
        dot={colors.red}
        bg={colors.redSoft}
        fg={colors.red}
        label="No data in feed"
        sub="delivery_core_ops returned no rows in the last 7 days. Ping the data team."
      />
    );
  }

  // BQ stores order_date as a DATE; treat as "end of that day" for age calc
  // so a row dated today doesn't show as "23h ago" the moment we cross midnight.
  const latest = new Date(maxOrderDate + 'T23:59:59Z').getTime();
  const now = new Date(queriedAt).getTime();
  const ageHours = Math.max(0, (now - latest) / 3600000);

  let dot: string;
  let bg: string;
  let fg: string;
  let label: string;
  if (ageHours < 36) {
    dot = colors.green;
    bg = colors.greenSoft;
    fg = colors.green;
    label = 'Live';
  } else if (ageHours < 72) {
    dot = colors.amber;
    bg = colors.amberSoft;
    fg = colors.amber;
    label = 'Stale';
  } else {
    dot = colors.red;
    bg = colors.redSoft;
    fg = colors.red;
    label = 'Very stale';
  }

  return (
    <Pill
      dot={dot}
      bg={bg}
      fg={fg}
      label={`${label} · ${fmtAge(ageHours)}`}
      sub={`Last data ${maxOrderDate}`}
    />
  );
}

function Pill({
  dot,
  bg,
  fg,
  label,
  sub,
}: {
  dot: string;
  bg: string;
  fg: string;
  label: string;
  sub: string;
}) {
  return (
    <span
      title={sub}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: space[2],
        background: bg,
        color: fg,
        border: `1px solid ${fg}30`,
        borderRadius: radii.sm,
        padding: `${space[1]} ${space[3]}`,
        fontFamily: fonts.body,
        fontSize: text.xs,
        fontWeight: 600,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: dot,
          flexShrink: 0,
        }}
      />
      {label}
    </span>
  );
}
