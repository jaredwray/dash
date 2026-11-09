import Link from "next/link";
import { cta } from "~/lib/site";
import { Field } from "./field";
import { FormError } from "./form-error";
import { SubmitButton } from "./submit-button";

type LoginFormProps = {
  /** A form-level error message from the last submit. */
  error?: string;
};

/**
 * The sign-in form for Dash Cloud. The form posts its fields and keeps no client state.
 * Do not rename a field: the server action reads the fields by these names.
 */
export function LoginForm({ error }: LoginFormProps) {
  return (
    <form method="post" aria-label="Sign in" className="flex flex-col gap-5">
      <FormError message={error} />
      <Field name="email" label="Email" type="email" autoComplete="email" required />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
      />
      <div className="pt-1">
        <SubmitButton>Sign in</SubmitButton>
      </div>
      <p className="text-center text-sm leading-6 text-mist">
        Are you new to Dash Cloud?{" "}
        <Link
          href={cta.cloud.href}
          className="font-medium text-paper underline decoration-line-2 underline-offset-4 hover:decoration-accent"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
