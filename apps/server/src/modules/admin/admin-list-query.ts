import type { PaginatedResponse } from "@stepwhere/types";

export type AdminListQueryInput = {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: string;
  dir?: "asc" | "desc";
};

export type ParsedAdminListQuery<Sort extends string> = {
  page: number;
  pageSize: number;
  offset: number;
  search: string;
  sort: Sort;
  dir: "asc" | "desc";
};

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function parseAdminListQuery<Sort extends string>(input: AdminListQueryInput, options: {
  defaultSort: Sort;
  allowedSorts: readonly Sort[];
}): ParsedAdminListQuery<Sort> {
  const page = Math.max(DEFAULT_PAGE, Number.isFinite(input.page) ? Math.trunc(input.page as number) : DEFAULT_PAGE);
  const requestedPageSize = Number.isFinite(input.pageSize) ? Math.trunc(input.pageSize as number) : DEFAULT_PAGE_SIZE;
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize));
  const search = input.search?.trim() ?? "";
  const sort = options.allowedSorts.includes((input.sort ?? options.defaultSort) as Sort)
    ? (input.sort ?? options.defaultSort) as Sort
    : options.defaultSort;
  const dir = input.dir === "asc" ? "asc" : "desc";

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    search,
    sort,
    dir,
  };
}

export function buildPaginatedResponse<T>(input: {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}): PaginatedResponse<T> {
  return {
    items: input.items,
    page: input.page,
    pageSize: input.pageSize,
    total: input.total,
    hasMore: input.page * input.pageSize < input.total,
  };
}
