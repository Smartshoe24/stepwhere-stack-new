import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { userEvent } from "vitest/browser";
import { ApiError, completeAdminSetup } from "@/lib/api-client";
import { AdminSetupForm } from "./admin-setup-form";

const navigate = vi.fn();
const completeAdminSetupMock = vi.mocked(completeAdminSetup);

vi.mock("@/lib/api-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api-client")>();
  return {
    ApiError: actual.ApiError,
    completeAdminSetup: vi.fn(),
  };
});

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

const FORM_MESSAGES = {
  passwordEmpty: "Please enter a password.",
  passwordTooShort: "Password must be at least 12 characters long.",
  confirmPasswordEmpty: "Please confirm your password.",
  passwordMismatch: "Passwords don't match.",
  setupCodeEmpty: "Please enter the setup code.",
} as const;

const PASSWORD = "correct horse battery";
const SETUP_CODE = "setup-code-0123456789";

describe("AdminSetupForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    completeAdminSetupMock.mockResolvedValue({ email: "admin@stepwhere.in" });
  });

  async function renderForm() {
    const screen = await render(<AdminSetupForm email="admin@stepwhere.in" />);

    return {
      screen,
      emailInput: screen.getByRole("textbox", { name: /^Email$/i }),
      passwordInput: screen.getByLabelText(/^Password$/i),
      confirmPasswordInput: screen.getByLabelText(/^Confirm Password$/i),
      setupCodeInput: screen.getByLabelText(/^Setup Code$/i),
      submitButton: screen.getByRole("button", { name: /^Set up admin$/i }),
    };
  }

  async function fillValidForm(
    fields: Awaited<ReturnType<typeof renderForm>>,
    overrides: Partial<{
      password: string;
      confirm: string;
      code: string;
    }> = {},
  ) {
    await userEvent.fill(fields.passwordInput, overrides.password ?? PASSWORD);
    await userEvent.fill(
      fields.confirmPasswordInput,
      overrides.confirm ?? overrides.password ?? PASSWORD,
    );
    await userEvent.fill(fields.setupCodeInput, overrides.code ?? SETUP_CODE);
  }

  it("shows the initial admin email read-only", async () => {
    const { emailInput } = await renderForm();

    await expect.element(emailInput).toHaveValue("admin@stepwhere.in");
    await expect.element(emailInput).toHaveAttribute("readonly");
  });

  it("shows validation messages when submitting an empty form", async () => {
    const { screen, submitButton } = await renderForm();

    await userEvent.click(submitButton);

    await expect
      .element(screen.getByText(FORM_MESSAGES.passwordEmpty))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText(FORM_MESSAGES.confirmPasswordEmpty))
      .toBeInTheDocument();
    await expect
      .element(screen.getByText(FORM_MESSAGES.setupCodeEmpty))
      .toBeInTheDocument();
    expect(completeAdminSetupMock).not.toHaveBeenCalled();
  });

  it("requires at least 12 password characters", async () => {
    const fields = await renderForm();

    await fillValidForm(fields, { password: "elevenchars" });
    await userEvent.click(fields.submitButton);

    await expect
      .element(fields.screen.getByText(FORM_MESSAGES.passwordTooShort))
      .toBeInTheDocument();
    expect(completeAdminSetupMock).not.toHaveBeenCalled();
  });

  it("shows a mismatch error when passwords do not match", async () => {
    const fields = await renderForm();

    await fillValidForm(fields, { confirm: `${PASSWORD}!` });
    await userEvent.click(fields.submitButton);

    await expect
      .element(fields.screen.getByText(FORM_MESSAGES.passwordMismatch))
      .toBeInTheDocument();
    expect(completeAdminSetupMock).not.toHaveBeenCalled();
  });

  it("sets up the admin and goes to the normal sign-in", async () => {
    const fields = await renderForm();

    await fillValidForm(fields, { code: `  ${SETUP_CODE}  ` });
    await userEvent.click(fields.submitButton);

    await vi.waitFor(() =>
      expect(completeAdminSetupMock).toHaveBeenCalledWith({
        password: PASSWORD,
        setupCode: SETUP_CODE,
      }),
    );
    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/sign-in", replace: true }),
    );
  });

  it("shows an invalid setup code on the code field", async () => {
    completeAdminSetupMock.mockRejectedValue(
      new ApiError(403, { code: "FORBIDDEN", message: "Invalid setup code." }),
    );
    const fields = await renderForm();

    await fillValidForm(fields);
    await userEvent.click(fields.submitButton);

    await expect
      .element(fields.screen.getByText("That setup code is not valid."))
      .toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it("goes to sign-in when setup has already been completed", async () => {
    completeAdminSetupMock.mockRejectedValue(
      new ApiError(404, {
        code: "NOT_FOUND",
        message: "Admin setup is not available.",
      }),
    );
    const fields = await renderForm();

    await fillValidForm(fields);
    await userEvent.click(fields.submitButton);

    await vi.waitFor(() =>
      expect(navigate).toHaveBeenCalledWith({ to: "/sign-in", replace: true }),
    );
  });
});
