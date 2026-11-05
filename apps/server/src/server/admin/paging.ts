/**
 * D210: every list in the admin portal loads one page of 20 rows at a time (with the total),
 * never the whole table.
 */
export const ADMIN_PAGE_SIZE = 20;

/** A page number from the query string: 1 to 10,000, anything else is 1. */
export function pageNumber(raw: unknown): number {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= 10_000 ? n : 1;
}

/** Prisma's skip / take for a page. */
export const pageWindow = (page: number) => ({
  skip: (page - 1) * ADMIN_PAGE_SIZE,
  take: ADMIN_PAGE_SIZE,
});

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export function toPage<T>(rows: T[], total: number, page: number): Page<T> {
  return {
    rows,
    total,
    page,
    pageSize: ADMIN_PAGE_SIZE,
    pages: Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE)),
  };
}

/** The page numbers without the rows (sent beside a list that keeps its own name). */
export function pageInfo<T>({ rows: _rows, ...info }: Page<T>): Omit<Page<T>, 'rows'> {
  return info;
}

/** One page of a list that's already in memory (e.g. grouped from a capped query). */
export function slicePage<T>(all: T[], page: number): Page<T> {
  const { skip, take } = pageWindow(page);
  return toPage(all.slice(skip, skip + take), all.length, page);
}
