"use client";

import Link from "next/link";
import { useActionState } from "react";
import { cta } from "~/lib/site";
import { type AuthFormState, loginAction } from "~/server/actions";
import { Field } from "./field";
import { FormError } from "./form-error";
import { SubmitButton } from "./submit-button";

const initialState: AuthFormState = {};

/**
 * The sign-in form for Dash Cloud. It calls `loginAction`, which reads the fields by name.
 * After a refused submit, the email field shows the typed value again.
 */
export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initialState);
  return (
    <form action={formAction} aria-label="Sign in" className="flex flex-col gap-5">
      <FormError message={state.error} />
      <Field
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
        defaultValue={state.values?.email}
      />
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
