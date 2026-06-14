/** Quick check of extract OTP/links */
import assert from "node:assert/strict";
import { extractLinks, extractOtp, primaryLink } from "../src/services/extract";
import { extractHtmlActions } from "../src/services/html-actions";
import { buildVerificationMetadata } from "../src/services/message-verify";

const sample = `
Your code is 847291
Or click https://github.com/users/confirm?token=abc
Unsubscribe: https://example.com/unsubscribe
`;

const microsoft = "Use 5677 as Microsoft account security code";

console.log("otp:", extractOtp(sample));
console.log("otp (parse-otp-message):", extractOtp(microsoft));
const links = extractLinks(sample);
console.log("links:", links);
const primary = primaryLink(links);
console.log("primaryLink:", primary);
const otpMeta = buildVerificationMetadata(extractOtp(sample), links, primary);
assert.equal(otpMeta.confidence, "high");
assert.equal(otpMeta.matchedRule, "otp_6_digit");
const linkMeta = buildVerificationMetadata(null, links, primary);
assert.equal(linkMeta.confidence, "high");
assert.equal(linkMeta.matchedRule, "verification_link");

const actions = extractHtmlActions({
  html: `
    <p>Confirm your account</p>
    <a class="button primary" href="https://app.example.com/verify?token=abc">Verify email</a>
    <a href="https://app.example.com/privacy">Privacy</a>
    <a href="https://app.example.com/unsubscribe">Unsubscribe</a>
  `,
});
assert.equal(actions.primaryButton?.text, "Verify email");
assert.equal(actions.primaryButton?.href, "https://app.example.com/verify?token=abc");
assert.deepEqual(actions.filteredLinks, ["https://app.example.com/verify?token=abc"]);
assert.match(actions.visibleText, /Confirm your account Verify email/);
console.log("htmlActions:", actions.primaryButton);
