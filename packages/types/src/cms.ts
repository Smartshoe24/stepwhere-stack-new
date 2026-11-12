export type CmsPageDto = {
  id: string;
  slug: string;
  title: string;
  body: string;
  status: "draft" | "active" | "archived";
  createdAt: string;
  updatedAt: string;
};

export type FeedbackSubmissionInput = {
  name?: string | null;
  email?: string | null;
  phoneNumber?: string | null;
  message: string;
};
