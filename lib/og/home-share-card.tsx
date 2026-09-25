import type { ReactElement } from 'react';
import { formatCongressOrdinal } from '@/lib/congress';
import { formatCount } from '@/lib/utils';
import { BillStages, stageLabel } from '@/lib/utils/bill-stages';
import { BigFigure, C, CardFrame, INK_2, STAGE, SUNKEN } from './card-parts';

/**
 * The picture the home page's link unfurls into (Documentation/brand.md,
 * "Share card"): the Congress in one figure, and where its bills stand, one
 * row per stage in the stage colours. The finding the rows draw is the one the
 * home page makes: nearly everything is still in committee.
 *
 * The figures are the home page's own (`getCongressDashboard`, the precomputed
 * `congressStats` row), used only when complete — see `homeCardFromDashboard`.
 */

export interface HomeCardData {
  congress: number;
  total: number;
  /** Stages holding bills, in path order; null when they do not add up to `total`. */
  stages: { stage: number; count: number }[] | null;
}

/** The dashboard fields this card reads (api.bills.getCongressDashboard). */
export interface DashboardStats {
  congress: number;
  totalBills: number;
  statusBreakdown: {
    introduced: number;
    inCommittee: number;
    passedOneChamber: number;
    passedBothChambers: number;
    vetoed: number;
    toPresident: number;
    signed: number;
    becameLaw: number;
  };
}

/**
 * Path order, with Vetoed where a bill stops — after reaching the President —
 * as the stage track draws it.
 */
const ROW_ORDER: Array<[number, keyof DashboardStats['statusBreakdown']]> = [
  [BillStages.INTRODUCED, 'introduced'],
  [BillStages.IN_COMMITTEE, 'inCommittee'],
  [BillStages.PASSED_ONE_CHAMBER, 'passedOneChamber'],
  [BillStages.PASSED_BOTH_CHAMBERS, 'passedBothChambers'],
  [BillStages.TO_PRESIDENT, 'toPresident'],
  [BillStages.VETOED, 'vetoed'],
  [BillStages.SIGNED_BY_PRESIDENT, 'signed'],
  [BillStages.BECAME_LAW, 'becameLaw'],
];

/**
 * The card's data from the dashboard row. The stage rows are drawn only when
 * they account for every bill in the total: a breakdown that does not add up
 * is not a breakdown of this Congress (AGENTS.md, "Answer accuracy"). Stages
 * with no bills are left off the card rather than drawn as empty rows.
 */
export function homeCardFromDashboard(d: DashboardStats): HomeCardData {
  const all = ROW_ORDER.map(([stage, key]) => ({ stage, count: d.statusBreakdown[key] }));
  const sum = all.reduce((n, s) => n + s.count, 0);
  return {
    congress: d.congress,
    total: d.totalBills,
    stages: sum === d.totalBills ? all.filter((s) => s.count > 0) : null,
  };
}

export function HomeShareCard({ data }: { data: HomeCardData }): ReactElement {
  const law = data.stages?.find((s) => s.stage === BillStages.BECAME_LAW)?.count ?? 0;
  const max = data.stages ? Math.max(1, ...data.stages.map((s) => s.count)) : 1;
  return (
    <CardFrame context={`${formatCongressOrdinal(data.congress)} Congress`}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: data.stages ? 480 : 1056 }}>
          <BigFigure size={150}>{formatCount(data.total)}</BigFigure>
          <div style={{ fontFamily: 'Newsreader', fontWeight: 500, fontSize: 44, lineHeight: 1.1, marginTop: 20 }}>
            bills and resolutions
          </div>
          <div style={{ fontFamily: 'Newsreader', fontWeight: 500, fontSize: 44, lineHeight: 1.1, color: INK_2 }}>
            introduced
          </div>
          {data.stages && (
            <div style={{ fontSize: 28, fontWeight: 500, color: STAGE[100].text, marginTop: 18 }}>
              {`${formatCount(law)} became law`}
            </div>
          )}
        </div>
        {data.stages && (
          <div style={{ display: 'flex', flexDirection: 'column', width: 500 }}>
            {data.stages.map((row, i) => (
              <div key={row.stage} style={{ display: 'flex', flexDirection: 'column', marginTop: i ? 12 : 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 500 }}>
                  <span>{stageLabel(row.stage)}</span>
                  <span style={{ fontFamily: 'Geist Mono', color: C.muted }}>{formatCount(row.count)}</span>
                </div>
                <div style={{ display: 'flex', marginTop: 6, height: 16, width: '100%', borderRadius: 4, background: SUNKEN }}>
                  <div
                    style={{
                      // A stage with bills is never drawn empty: 2 of 19,067 is
                      // a hairline at true scale, so it gets a 6px sliver. The
                      // count beside it is exact.
                      width: `${(row.count / max) * 100}%`,
                      minWidth: 6,
                      borderRadius: 4,
                      background: STAGE[row.stage].fill,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </CardFrame>
  );
}
