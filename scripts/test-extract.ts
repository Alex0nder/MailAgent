/** Быстрая проверка extract OTP/links */
import { extractLinks, extractOtp, primaryLink } from "../src/services/extract";

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
console.log("primaryLink:", primaryLink(links));
