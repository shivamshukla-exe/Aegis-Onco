import { motion } from 'framer-motion';
import type { CSSProperties } from 'react';

/**
 * AegisOnco — Skeleton shimmer components
 * -----------------------------------------------------------------------------
 * Loading placeholders that mirror the light glassmorphism aesthetic of the
 * real components in `ui.tsx`: frosted white cards, soft shadows, subtle
 * borders, JetBrains Mono data text, and small precise typography.
 *
 * Two layers of motion keep things feeling alive while data loads:
 *   1. A CSS gradient "shimmer" sweep (reuses the global `.shimmer` class from
 *      index.css — a violet-tinted highlight that travels left → right).
 *   2. A framer-motion opacity pulse as an additional fallback / accent so
 *      the element breathes even if the CSS animation is overridden.
 */

// ---------------------------------------------------------------------------
// Base Skeleton
// ---------------------------------------------------------------------------

export interface SkeletonProps {
  /** Extra Tailwind classes appended after the defaults. */
  className?: string;
  /** Inline width — accepts any CSS length (e.g. "100%", "120px", "4rem"). */
  width?: string;
  /** Inline height — accepts any CSS length. */
  height?: string;
  /** Tailwind border-radius utility (e.g. "rounded-lg", "rounded-full"). */
  rounded?: string;
}

/**
 * The primitive shimmer block. Every other skeleton composes this.
 *
 * It renders a div with:
 *   - a slate-100 → slate-200 base fill (the "unlit" bone)
 *   - the global `.shimmer` overlay (violet gradient sweep)
 *   - a framer-motion opacity oscillation as a secondary pulse
 *   - a 1px slate-200/60 border for the glass edge
 */
export function Skeleton({ className = '', width, height, rounded = 'rounded-lg' }: SkeletonProps) {
  const style: CSSProperties = {
    width,
    height,
  };

  return (
    <motion.div
      aria-hidden="true"
      style={style}
      animate={{ opacity: [0.55, 0.85, 0.55] }}
      transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      className={`shimmer relative overflow-hidden border border-slate-200/60 bg-gradient-to-r from-slate-100 to-slate-200/80 ${rounded} ${className}`}
    />
  );
}

// ---------------------------------------------------------------------------
// KPI Skeleton — mirrors KpiCard layout
// ---------------------------------------------------------------------------

/**
 * Placeholder matching `KpiCard`:
 *   - icon placeholder (top-left, 9×9 rounded square)
 *   - label placeholder (top-right, small pill)
 *   - big value placeholder (26px-mono-sized bar)
 *   - sub-text placeholder (thin bar underneath)
 *   - a faint blurred orb in the bottom-right corner, like the real card
 */
export function KpiSkeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`glass-card relative rounded-2xl p-5 overflow-hidden ${className}`}
    >
      {/* Top row: icon + label */}
      <div className="flex items-start justify-between mb-3">
        <Skeleton rounded="rounded-xl" width="36px" height="36px" />
        <Skeleton rounded="rounded-full" width="64px" height="14px" />
      </div>

      {/* Big value */}
      <Skeleton className="mt-1" rounded="rounded-md" width="78%" height="26px" />

      {/* Sub-text */}
      <Skeleton className="mt-2" rounded="rounded-md" width="52%" height="11px" />

      {/* Faint gradient orb — echoes the KpiCard accent blur */}
      <div className="pointer-events-none absolute -bottom-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br from-violet-400 to-purple-500 opacity-[0.06] blur-2xl" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart Skeleton — card with header + fake bar shapes
// ---------------------------------------------------------------------------

/**
 * Placeholder for a chart card: a header (title + small legend pills) and a
 * large plot area containing a row of fake "bars" of varying heights to hint
 * at the shape of an upcoming bar/area chart.
 */
export function ChartSkeleton({ className = '' }: { className?: string }) {
  // Varying heights give the silhouette of a real bar chart.
  const barHeights = [42, 68, 55, 80, 48, 72, 60, 38, 64, 50];

  return (
    <div className={`glass-card relative rounded-2xl p-5 overflow-hidden ${className}`}>
      {/* Header: title + legend pills */}
      <div className="flex items-center justify-between mb-5">
        <Skeleton rounded="rounded-md" width="140px" height="14px" />
        <div className="flex items-center gap-2">
          <Skeleton rounded="rounded-full" width="48px" height="10px" />
          <Skeleton rounded="rounded-full" width="48px" height="10px" />
        </div>
      </div>

      {/* Plot area */}
      <div className="relative h-56 rounded-xl border border-slate-200/50 bg-slate-50/40 p-4">
        {/* Baseline axis ticks on the left */}
        <div className="absolute left-3 top-4 bottom-4 flex flex-col justify-between">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} rounded="rounded-sm" width="22px" height="7px" />
          ))}
        </div>

        {/* Fake bars */}
        <div className="absolute left-12 right-4 bottom-4 top-4 flex items-end justify-between gap-2">
          {barHeights.map((h, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: [0.4, 0.7, 0.4] }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: i * 0.08,
              }}
              className="shimmer flex-1 rounded-t-md border border-slate-200/60 bg-gradient-to-t from-slate-200 to-slate-100"
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table Skeleton — header row + 5 data rows
// ---------------------------------------------------------------------------

/**
 * Placeholder for a data table: a header row and five body rows. Each row has
 * 4–5 cell placeholders of varying widths so it reads as a real table at a
 * glance. The first column is a touch wider (mimicking an ID / name column).
 */
export function TableSkeleton({ className = '', rows = 5 }: { className?: string; rows?: number }) {
  // Relative widths per column; first column wider, last column narrow.
  const colWidths = ['22%', '18%', '16%', '20%', '14%'];

  return (
    <div className={`glass-card relative rounded-2xl overflow-hidden ${className}`}>
      {/* Header row */}
      <div className="grid items-center gap-4 px-5 py-3.5 border-b border-slate-200/60 bg-slate-50/50"
        style={{ gridTemplateColumns: `repeat(${colWidths.length}, 1fr)` }}>
        {colWidths.map((w, i) => (
          <Skeleton key={`h-${i}`} rounded="rounded-md" width={w} height="11px" />
        ))}
      </div>

      {/* Body rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <motion.div
          key={r}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: r * 0.04 }}
          className="grid items-center gap-4 px-5 py-4 border-b border-slate-100/80 last:border-b-0"
          style={{ gridTemplateColumns: `repeat(${colWidths.length}, 1fr)` }}
        >
          {colWidths.map((w, i) => (
            <Skeleton
              key={`r${r}-c${i}`}
              rounded="rounded-md"
              // Vary width slightly per row so it doesn't look mechanical.
              width={`calc(${w} * ${0.7 + ((r + i) % 3) * 0.12})`}
              height={i === 0 ? '13px' : '11px'}
            />
          ))}
        </motion.div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page Skeleton — composes the above per page variant
// ---------------------------------------------------------------------------

export type PageVariant = 'registry' | 'analytics' | 'detail' | 'default';

/**
 * Full-page loading skeleton. The `variant` selects a layout that mirrors the
 * real page so the transition into loaded content feels seamless.
 *
 *   - 'registry'  : page header + KPI row + a large table
 *   - 'analytics' : page header + KPI row + two charts side by side + a table
 *   - 'detail'    : page header + a detail panel (left) + a chart (right)
 *   - 'default'   : page header + KPI row + a chart
 */
export function PageSkeleton({ variant = 'default' }: { variant?: PageVariant }) {
  return (
    <div className="min-h-full">
      {/* Page header placeholder — mirrors PageHeader */}
      <div className="flex items-center gap-4 mb-6">
        <Skeleton rounded="rounded-2xl" width="48px" height="48px" />
        <div className="flex flex-col gap-2">
          <Skeleton rounded="rounded-md" width="180px" height="22px" />
          <Skeleton rounded="rounded-md" width="140px" height="10px" />
        </div>
      </div>

      {variant === 'registry' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <KpiSkeleton key={i} />
            ))}
          </div>
          <TableSkeleton />
        </>
      )}

      {variant === 'analytics' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <KpiSkeleton key={i} />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
          <TableSkeleton rows={4} />
        </>
      )}

      {variant === 'detail' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Detail panel — left, spans 1 column */}
          <div className="glass-card rounded-2xl p-5 lg:col-span-1">
            <div className="flex flex-col gap-4">
              <Skeleton rounded="rounded-xl" width="100%" height="120px" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <Skeleton rounded="rounded-md" width="40%" height="10px" />
                  <Skeleton rounded="rounded-md" width="85%" height="13px" />
                </div>
              ))}
            </div>
          </div>

          {/* Chart — right, spans 2 columns */}
          <ChartSkeleton className="lg:col-span-2" />
        </div>
      )}

      {variant === 'default' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <KpiSkeleton key={i} />
            ))}
          </div>
          <ChartSkeleton />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export summary
// ---------------------------------------------------------------------------
// Skeleton       — base shimmer block
// KpiSkeleton    — KPI card placeholder
// ChartSkeleton  — chart card placeholder with fake bars
// TableSkeleton  — table card placeholder with header + N rows
// PageSkeleton   — full-page composite (registry | analytics | detail | default)
