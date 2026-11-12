import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ApiError, completeAdminSetup } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";

const formSchema = z
  .object({
    email: z.string(),
    password: z
      .string()
      .min(1, "Please enter a password.")
      .min(12, "Password must be at least 12 characters long."),
    confirmPassword: z.string().min(1, "Please confirm your password."),
    setupCode: z.string().trim().min(1, "Please enter the setup code."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match.",
    path: ["confirmPassword"],
  });

function toSetupErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 403:
        return "That setup code is not valid.";
      case 404:
        return "Admin setup is already complete. Sign in instead.";
      case 429:
        return "Too many attempts. Wait a few minutes and try again.";
      default:
        return error.message;
    }
  }

  return error instanceof Error
    ? error.message
    : "Unable to set up the admin account.";
}

interface AdminSetupFormProps extends React.HTMLAttributes<HTMLFormElement> {
  email: string;
}

export function AdminSetupForm({
  className,
  email,
  ...props
}: AdminSetupFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email,
      password: "",
      confirmPassword: "",
      setupCode: "",
    },
  });

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true);

    try {
      await completeAdminSetup({
        password: data.password,
        setupCode: data.setupCode.trim(),
      });

      toast.success("Admin account set up. Sign in to continue.");
      navigate({ to: "/sign-in", replace: true });
    } catch (error) {
      const message = toSetupErrorMessage(error);

      if (error instanceof ApiError && error.status === 404) {
        toast.info(message);
        navigate({ to: "/sign-in", replace: true });
        return;
      }

      if (error instanceof ApiError && error.status === 403) {
        form.setError("setupCode", { message });
      } else {
        form.setError("root", { message });
      }
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        method="post"
        className={cn("grid gap-3", className)}
        {...props}
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  readOnly
                  type="email"
                  autoComplete="username"
                  className="cursor-default bg-raised text-ink-3 hover:shadow-[inset_0_0_0_1px_var(--line)]"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput
                  {...field}
                  autoComplete="new-password"
                  placeholder="************"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm Password</FormLabel>
              <FormControl>
                <PasswordInput
                  {...field}
                  autoComplete="new-password"
                  placeholder="************"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="setupCode"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Setup Code</FormLabel>
              <FormControl>
                <PasswordInput
                  {...field}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="From ADMIN_SETUP_CODE"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="submit"
          size="lg"
          className="mt-2 w-full"
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="animate-spin" /> : <KeyRound />}
          Set up admin
        </Button>
        {form.formState.errors.root?.message ? (
          <p className="text-sm text-destructive">
            {form.formState.errors.root.message}
          </p>
        ) : null}
      </form>
    </Form>
  );
}
