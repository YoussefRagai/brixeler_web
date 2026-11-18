export type PortalInviteDeliveryError = { code?: string; status?: number };

export function describePortalInviteDeliveryError(error: PortalInviteDeliveryError | null) {
  if (error?.code === "invite_recipient_changed" || error?.code === "user_not_found") {
    return { status: 409, message: "The member's authentication email no longer matches this invitation. Review the member record before resending." };
  }
  if (error?.code === "email_exists" || error?.code === "user_already_exists") {
    return { status: 409, message: "This email is already registered with Brixeler. Check the existing account before trying again." };
  }
  if (error?.code === "email_address_invalid" || error?.code === "email_address_not_authorized") {
    return { status: 400, message: "The email service could not send to this address. Check the recipient address and the Auth email configuration." };
  }
  if (error?.status === 429 || error?.code === "over_email_send_rate_limit") {
    return { status: 429, message: "The email service is rate limiting requests. Wait a minute before trying again." };
  }
  return { status: 502, message: "The Auth email service could not confirm submission. Try again in a moment." };
}

export function getPortalInviteSubmissionMessage(emailKind: "invite" | "recovery") {
  return emailKind === "recovery"
    ? "Password setup email submitted for delivery. Access stays pending until setup is complete."
    : "Invitation email submitted for delivery.";
}
