export type ApiErrorDto = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiSuccessDto<T> = {
  data: T;
};

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};
