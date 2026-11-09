import Link from "next/link";
import { cta } from "~/lib/site";
import { Field } from "./field";
import { FormError } from "./form-error";
import { SubmitButton } from "./submit-button";

type RegisterFormProps = {
  /** A form-level error message from the last submit. */
  error?: string;
};

/**
 * The sign-up form for Dash Cloud. The form posts its fields and keeps no client state.
 * Do not rename a field: the server action reads the fields by these names.
 */
export function RegisterForm({ error }: RegisterFormProps) {
  return (
    <form method="post" aria-label="Create account" className="flex flex-col gap-5">
      <FormError message={error} />
      <Field
        name="name"
        label="Full name"
        type="text"
        autoComplete="name"
        required
        maxLength={80}
      />
      <Field
        name="email"
        label="Work email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
      />
      <Field
        name="organization"
        label="Organization name"
        type="text"
        autoComplete="organization"
        required
        maxLength={80}
        hint="Your team's name in Dash Cloud."
      />
      <Field
        name="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={200}
        hint="Use 8 or more characters."
      />
      <div className="pt-1">
        <SubmitButton>Create account</SubmitButton>
      </div>
      <p className="text-center text-sm leading-6 text-mist">
        Do you have an account?{" "}
        <Link
          href={cta.signIn.href}
          className="font-medium text-paper underline decoration-line-2 underline-offset-4 hover:decoration-accent"
        >
          {cta.signIn.label}
        </Link>
      </p>
    </form>
  );
}
