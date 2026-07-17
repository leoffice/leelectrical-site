// Inline tappable phone / email / address (opens dialer, mail, or Google Maps).
import React from "react";
import { emailHref, googleMapsHref, isDesktop, phoneHref } from "../lib/contactLinks.js";

const LINK =
  "text-brand font-semibold active:opacity-80 underline-offset-2 hover:underline break-words";

export function TappablePhone({ phone, className = "" }) {
  const href = phoneHref(phone);
  if (!phone) return null;
  if (!href) return <span className={className}>{phone}</span>;
  return (
    <a
      href={href}
      className={`${LINK} ${className}`.trim()}
      onClick={(e) => e.stopPropagation()}
      data-testid="tap-phone"
    >
      {phone}
    </a>
  );
}

export function TappableEmail({ email, className = "" }) {
  const href = emailHref(email);
  if (!email) return null;
  if (!href) return <span className={className}>{email}</span>;
  return (
    <a
      href={href}
      className={`${LINK} ${className}`.trim()}
      target={isDesktop() ? "_blank" : undefined}
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      data-testid="tap-email"
    >
      {email}
    </a>
  );
}

export function TappableAddress({ address, className = "" }) {
  const href = googleMapsHref(address);
  if (!address) return null;
  if (!href) return <span className={className}>{address}</span>;
  return (
    <a
      href={href}
      className={`${LINK} ${className}`.trim()}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      data-testid="tap-address"
    >
      {address}
    </a>
  );
}
