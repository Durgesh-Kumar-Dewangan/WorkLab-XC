'use client';

import { ForgotPasswordForm } from './AccountLinkForms';

/** Body of the "Reset your password" dialog. The server emails a reset link. */
export function ForgotModal() {
  return <ForgotPasswordForm embedded />;
}
