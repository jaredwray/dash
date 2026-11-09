"use client";

import Link from "next/link";
import { useActionState } from "react";
import { cta } from "~/lib/site";
import { type AuthFormState, registerAction } from "~/server/actions";
import { Field } from "./field";
import { FormError } from "./form-error";
import { SubmitButton } from "./submit-button";

const initialState: AuthFormState = {};

/**
 * The sign-up form for Dash Cloud. It calls `registerAction`, which reads the fields by name.
 * After a refused submit, the fields show the typed values again, but not the password.
 */
export function RegisterForm() {
  const [state, formAction] = useActionState(registerAction, initialState);
  return (
    <form action={formAction} aria-label="Create account" className="flex flex-col gap-5">
      <FormError message={state.error} />
      <Field
        name="name"
        label="Full name"
        type="text"
        autoComplete="name"
        required
        maxLength={80}
        defaultValue={state.values?.name}
      />
      <Field
        name="email"
        label="Work email"
        type="email"
        autoComplete="email"
        required
        maxLength={254}
        defaultValue={state.values?.email}
      />
      <Field
        name="organization"
        label="Organization name"
        type="text"
        autoComplete="organization"
        required
        maxLength={80}
        hint="Your team's name in Dash Cloud."
        defaultValue={state.values?.organization}
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
